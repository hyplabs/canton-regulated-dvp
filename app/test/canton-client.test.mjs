import assert from "node:assert/strict";
import test from "node:test";
import {
  CantonApiError,
  CantonClient,
  extractCreatedEvent,
  validateAttestationInput,
  validateOfferInput,
} from "../lib/canton-client.mjs";

const context = {
  providerToken: "provider-token",
  providerWalletToken: "provider-wallet-token",
  userToken: "user-token",
  userWalletToken: "wallet-token",
  providerParty: "Provider::1220abcdef",
  investorParty: "Investor::1220fedcba",
  dsoParty: "DSO::1220dso",
};
const contractId = "00abcdef1234567890";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("validates and normalizes attestation input", () => {
  assert.deepEqual(validateAttestationInput({ assetClass: " PRIVATE-CREDIT ", validForHours: "3" }), {
    assetClass: "PRIVATE-CREDIT",
    validForHours: 3,
  });
});

test("rejects invalid attestation input", () => {
  assert.throws(
    () => validateAttestationInput({ assetClass: "x", validForHours: 0 }),
    (error) => error instanceof CantonApiError && error.code === "INVALID_ASSET_CLASS",
  );
  assert.throws(
    () => validateAttestationInput({ assetClass: "PRIVATE-CREDIT", validForHours: 169 }),
    (error) => error instanceof CantonApiError && error.code === "INVALID_VALIDITY",
  );
});

test("validates offer values using Daml-compatible numeric strings", () => {
  assert.deepEqual(
    validateOfferInput({
      attestationContractId: contractId,
      assetId: "PC-NOTE-2026-A",
      units: 1000,
      paymentAmount: "10.0",
      offerValidForMinutes: 30,
      settleInHours: 2,
    }),
    {
      attestationContractId: contractId,
      assetId: "PC-NOTE-2026-A",
      units: "1000",
      paymentAmount: "10.0",
      offerValidForMinutes: 30,
      settleInHours: 2,
    },
  );
});

test("rejects an offer whose settlement deadline precedes offer expiry", () => {
  assert.throws(
    () =>
      validateOfferInput({
        attestationContractId: contractId,
        assetId: "PC-NOTE-2026-A",
        units: 1000,
        paymentAmount: "10.0",
        offerValidForMinutes: 60,
        settleInHours: 1,
      }),
    (error) => error instanceof CantonApiError && error.code === "INVALID_DEADLINE_ORDER",
  );
});

test("finds a created event by template suffix", () => {
  const event = extractCreatedEvent(
    {
      transaction: {
        events: [
          { CreatedEvent: { contractId, templateId: "pkg:Settlement.Regulated:EligibilityAttestation" } },
        ],
      },
    },
    ":Settlement.Regulated:EligibilityAttestation",
  );
  assert.equal(event.contractId, contractId);
});

test("creates an attestation and independently confirms active contract state", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith("/v2/commands/submit-and-wait-for-transaction")) {
      return jsonResponse({
        transaction: {
          events: [
            {
              CreatedEvent: {
                contractId,
                templateId: "pkg:Settlement.Regulated:EligibilityAttestation",
              },
            },
          ],
        },
      });
    }
    return jsonResponse({
      created: {
        createdEvent: {
          contractId,
          templateId: "pkg:Settlement.Regulated:EligibilityAttestation",
          createArgument: {
            verifier: context.providerParty,
            investor: context.investorParty,
            assetClass: "PRIVATE-CREDIT",
            expiresAt: "2026-08-22T00:00:00Z",
          },
        },
      },
      archived: null,
    });
  };
  const client = new CantonClient({ fetchImpl, contextLoader: async () => context });

  const result = await client.createEligibilityAttestation({
    assetClass: "PRIVATE-CREDIT",
    validForHours: 3,
  });

  assert.equal(result.status, "active");
  assert.equal(result.contractId, contractId);
  assert.equal(result.assetClass, "PRIVATE-CREDIT");
  assert.equal(result.verifier, context.providerParty);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].body.commands.actAs, [context.providerParty]);
  assert.equal(
    requests[0].body.commands.commands[0].CreateCommand.createArguments.investor,
    context.investorParty,
  );
  assert.equal(requests[1].body.eventFormat.verbose, true);
  assert.equal(requests[1].options.headers.Authorization, "Bearer provider-token");
});

test("reports an archived attestation", async () => {
  const client = new CantonClient({
    contextLoader: async () => context,
    fetchImpl: async () =>
      jsonResponse({
        created: {
          createdEvent: {
            contractId,
            createArgument: {
              verifier: context.providerParty,
              investor: context.investorParty,
              assetClass: "PRIVATE-CREDIT",
              expiresAt: "2026-08-22T00:00:00Z",
            },
          },
        },
        archived: { archivedEvent: { contractId } },
      }),
  });

  assert.equal((await client.getEligibilityAttestation(contractId)).status, "archived");
});

test("creates an asset offer as the provider issuer", async () => {
  const offerContractId = "00offer1234567890";
  const requests = [];
  const attestationPayload = {
    verifier: context.providerParty,
    investor: context.investorParty,
    assetClass: "PRIVATE-CREDIT",
    expiresAt: "2026-08-22T00:00:00Z",
  };
  const fetchImpl = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ url, options, body });
    if (url.endsWith("/v2/commands/submit-and-wait-for-transaction")) {
      return jsonResponse({
        transaction: {
          events: [
            {
              CreatedEvent: {
                contractId: offerContractId,
                templateId: "pkg:Settlement.Regulated:AssetOffer",
              },
            },
          ],
        },
      });
    }
    if (body.contractId === contractId) {
      return jsonResponse({
        created: { createdEvent: { contractId, createArgument: attestationPayload } },
        archived: null,
      });
    }
    const createArguments = requests.find((request) => request.body?.commands)?.body.commands
      .commands[0].CreateCommand.createArguments;
    return jsonResponse({
      created: {
        createdEvent: { contractId: offerContractId, createArgument: createArguments },
      },
      archived: null,
    });
  };
  const client = new CantonClient({ fetchImpl, contextLoader: async () => context });

  const offer = await client.createAssetOffer({
    attestationContractId: contractId,
    assetId: "PC-NOTE-2026-A",
    units: 1000,
    paymentAmount: "10.0",
    offerValidForMinutes: 30,
    settleInHours: 2,
  });

  const commandRequest = requests.find((request) => request.body?.commands);
  assert.equal(offer.status, "active");
  assert.equal(offer.terms.units, "1000");
  assert.equal(offer.terms.assetClass, "PRIVATE-CREDIT");
  assert.deepEqual(commandRequest.body.commands.actAs, [context.providerParty]);
  assert.equal(commandRequest.options.headers.Authorization, "Bearer provider-token");
});

test("accepts an offer as the investor and returns the archived parent", async () => {
  const offerContractId = "00offer1234567890";
  const complianceContractId = "00compliance123456";
  let accepted = false;
  let submitRequest;
  const terms = {
    issuer: context.providerParty,
    investor: context.investorParty,
    verifier: context.providerParty,
    custodian: context.providerParty,
    auditor: context.providerParty,
    assetId: "PC-NOTE-2026-A",
    assetClass: "PRIVATE-CREDIT",
    units: "1000",
    paymentAmount: "10.0",
    paymentInstrumentId: "Amulet",
  };
  const fetchImpl = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    if (url.endsWith("/v2/commands/submit-and-wait-for-transaction")) {
      accepted = true;
      submitRequest = { url, options, body };
      return jsonResponse({
        transaction: {
          events: [
            {
              CreatedEvent: {
                contractId: complianceContractId,
                templateId: "pkg:Settlement.Regulated:CompliancePending",
              },
            },
          ],
        },
      });
    }
    if (body.contractId === contractId) {
      return jsonResponse({
        created: {
          createdEvent: {
            contractId,
            createArgument: {
              verifier: context.providerParty,
              investor: context.investorParty,
              assetClass: "PRIVATE-CREDIT",
              expiresAt: "2026-08-22T00:00:00Z",
            },
          },
        },
        archived: null,
      });
    }
    if (body.contractId === offerContractId) {
      return jsonResponse({
        created: {
          createdEvent: {
            contractId: offerContractId,
            createArgument: {
              terms,
              offerExpiresAt: "2026-08-21T22:00:00Z",
              settleBefore: "2026-08-22T00:00:00Z",
            },
          },
        },
        archived: accepted ? { archivedEvent: { contractId: offerContractId } } : null,
      });
    }
    return jsonResponse({
      created: {
        createdEvent: {
          contractId: complianceContractId,
          createArgument: {
            terms,
            eligibilityAttestationCid: contractId,
            settleBefore: "2026-08-22T00:00:00Z",
          },
        },
      },
      archived: null,
    });
  };
  const client = new CantonClient({ fetchImpl, contextLoader: async () => context });

  const result = await client.acceptAssetOffer(offerContractId, {
    attestationContractId: contractId,
  });

  assert.equal(result.offer.status, "archived");
  assert.equal(result.compliancePending.status, "active");
  assert.equal(submitRequest.url, "http://127.0.0.1:2975/v2/commands/submit-and-wait-for-transaction");
  assert.equal(submitRequest.options.headers.Authorization, "Bearer user-token");
  assert.deepEqual(submitRequest.body.commands.actAs, [context.investorParty]);
  assert.equal(
    submitRequest.body.commands.commands[0].ExerciseCommand.choice,
    "AcceptOffer",
  );
});

test("approves compliance as verifier and creates a purchase agreement", async () => {
  const complianceContractId = "00compliance123456";
  const agreementContractId = "00agreement1234567";
  let approved = false;
  let submitRequest;
  const terms = {
    issuer: context.providerParty,
    investor: context.investorParty,
    verifier: context.providerParty,
    custodian: context.providerParty,
    auditor: context.providerParty,
    assetId: "PC-NOTE-2026-A",
    assetClass: "PRIVATE-CREDIT",
    units: "1000",
    paymentAmount: "10.0",
    paymentInstrumentId: "Amulet",
  };
  const fetchImpl = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    if (url.endsWith("/v2/commands/submit-and-wait-for-transaction")) {
      approved = true;
      submitRequest = { url, options, body };
      return jsonResponse({
        transaction: {
          events: [
            {
              CreatedEvent: {
                contractId: agreementContractId,
                templateId: "pkg:Settlement.Regulated:PurchaseAgreement",
              },
            },
          ],
        },
      });
    }
    if (body.contractId === complianceContractId) {
      return jsonResponse({
        created: {
          createdEvent: {
            contractId: complianceContractId,
            createArgument: {
              terms,
              eligibilityAttestationCid: contractId,
              settleBefore: "2026-08-22T00:00:00Z",
            },
          },
        },
        archived: approved ? { archivedEvent: { contractId: complianceContractId } } : null,
      });
    }
    return jsonResponse({
      created: {
        createdEvent: {
          contractId: agreementContractId,
          createArgument: {
            terms,
            eligibilityAttestationCid: contractId,
            settleBefore: "2026-08-22T00:00:00Z",
          },
        },
      },
      archived: null,
    });
  };
  const client = new CantonClient({ fetchImpl, contextLoader: async () => context });

  const result = await client.approveCompliance(complianceContractId);

  assert.equal(result.compliancePending.status, "archived");
  assert.equal(result.purchaseAgreement.status, "active");
  assert.equal(submitRequest.url, "http://127.0.0.1:3975/v2/commands/submit-and-wait-for-transaction");
  assert.equal(submitRequest.options.headers.Authorization, "Bearer provider-token");
  assert.deepEqual(submitRequest.body.commands.actAs, [context.providerParty]);
  assert.equal(
    submitRequest.body.commands.commands[0].ExerciseCommand.choice,
    "ApproveCompliance",
  );
});

test("authorizes a tokenized payment across provider, investor, and wallet APIs", async () => {
  const agreementContractId = "00agreement1234567";
  const proposalContractId = "00proposal123456789";
  const approvedContractId = "00approved123456789";
  const requestContractId = "00request1234567890";
  let proposalArchived = false;
  let approvalArchived = false;
  const submissions = [];
  const terms = {
    issuer: context.providerParty,
    investor: context.investorParty,
    verifier: context.providerParty,
    custodian: context.providerParty,
    auditor: context.providerParty,
    assetId: "PC-NOTE-2026-A",
    assetClass: "PRIVATE-CREDIT",
    units: "1000",
    paymentAmount: "10.0",
    paymentInstrumentId: "Amulet",
  };
  const paymentPayload = {
    requestId: "regulated-ui-request",
    terms,
    agreementCid: agreementContractId,
    eligibilityAttestationCid: contractId,
    paymentInstrumentId: { admin: context.dsoParty, id: "Amulet" },
    requestedAt: "2026-08-21T20:00:00Z",
    allocateBefore: "2026-08-21T21:00:00Z",
    settleBefore: "2099-08-21T22:00:00Z",
  };
  const contractEvent = (id, payload, archived = false) =>
    jsonResponse({
      created: { createdEvent: { contractId: id, createArgument: payload } },
      archived: archived ? { archivedEvent: { contractId: id } } : null,
    });
  const fetchImpl = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    if (url.endsWith("/v0/wallet/token-standard/allocation-requests")) {
      assert.equal(options.headers.Authorization, "Bearer wallet-token");
      return jsonResponse({
        allocation_requests: [{ contract: { contract_id: requestContractId } }],
      });
    }
    if (url.endsWith("/v2/commands/submit-and-wait-for-transaction")) {
      const command = body.commands.commands[0];
      submissions.push({ url, options, body, command });
      if (command.CreateCommand) {
        return jsonResponse({
          transaction: {
            events: [
              {
                CreatedEvent: {
                  contractId: proposalContractId,
                  templateId: "pkg:Settlement.TokenizedPayment:TokenizedPaymentProposal",
                },
              },
            ],
          },
        });
      }
      if (command.ExerciseCommand.choice === "ApproveTokenizedPayment") {
        proposalArchived = true;
        return jsonResponse({
          transaction: {
            events: [
              {
                CreatedEvent: {
                  contractId: approvedContractId,
                  templateId: "pkg:Settlement.TokenizedPayment:ApprovedTokenizedPayment",
                },
              },
            ],
          },
        });
      }
      approvalArchived = true;
      return jsonResponse({
        transaction: {
          events: [
            {
              CreatedEvent: {
                contractId: requestContractId,
                templateId: "pkg:Settlement.TokenizedPayment:TokenizedPaymentRequest",
              },
            },
          ],
        },
      });
    }
    if (body.contractId === agreementContractId) {
      return contractEvent(agreementContractId, {
        terms,
        eligibilityAttestationCid: contractId,
        settleBefore: paymentPayload.settleBefore,
      });
    }
    if (body.contractId === proposalContractId) {
      return contractEvent(proposalContractId, paymentPayload, proposalArchived);
    }
    if (body.contractId === approvedContractId) {
      return contractEvent(approvedContractId, paymentPayload, approvalArchived);
    }
    return contractEvent(requestContractId, paymentPayload);
  };
  const client = new CantonClient({ fetchImpl, contextLoader: async () => context });

  const proposal = await client.createTokenizedPaymentProposal({ agreementContractId });
  const approval = await client.approveTokenizedPayment(proposal.contractId);
  const acceptance = await client.acceptTokenizedPayment(approval.approvedPayment.contractId);

  assert.equal(proposal.status, "active");
  assert.equal(approval.paymentProposal.status, "archived");
  assert.equal(approval.approvedPayment.status, "active");
  assert.equal(acceptance.approvedPayment.status, "archived");
  assert.equal(acceptance.paymentRequest.status, "active");
  assert.equal(acceptance.paymentRequest.walletDiscovered, true);
  assert.deepEqual(submissions.map(({ body }) => body.commands.actAs[0]), [
    context.providerParty,
    context.providerParty,
    context.investorParty,
  ]);
  assert.equal(submissions[2].url, "http://127.0.0.1:2975/v2/commands/submit-and-wait-for-transaction");
  assert.equal(submissions[2].options.headers.Authorization, "Bearer user-token");
});

test("allocates a wallet-discovered payment request as the investor", async () => {
  const requestContractId = "00request1234567890";
  const agreementContractId = "00agreement1234567";
  const allocationContractId = "00allocation12345678";
  const terms = {
    issuer: context.providerParty,
    investor: context.investorParty,
    verifier: context.providerParty,
    custodian: context.providerParty,
    auditor: context.providerParty,
    assetId: "PC-NOTE-2026-A",
    assetClass: "PRIVATE-CREDIT",
    units: "1000",
    paymentAmount: "10.0",
    paymentInstrumentId: "Amulet",
  };
  const paymentPayload = {
    requestId: "regulated-ui-request",
    terms,
    agreementCid: agreementContractId,
    eligibilityAttestationCid: contractId,
    paymentInstrumentId: { admin: context.dsoParty, id: "Amulet" },
    requestedAt: "2026-08-21T20:00:00Z",
    allocateBefore: "2026-08-21T21:00:00Z",
    settleBefore: "2026-08-21T22:00:00Z",
  };
  const standardView = {
    settlement: {
      executor: context.providerParty,
      settlementRef: { id: paymentPayload.requestId, cid: agreementContractId },
      requestedAt: paymentPayload.requestedAt,
      allocateBefore: paymentPayload.allocateBefore,
      settleBefore: paymentPayload.settleBefore,
      meta: { values: { reason: "purchase-payment" } },
    },
    transferLegs: {
      payment: {
        sender: context.investorParty,
        receiver: context.providerParty,
        amount: "10.0",
        instrumentId: paymentPayload.paymentInstrumentId,
        meta: { values: { asset: terms.assetId } },
      },
    },
  };
  let allocationRequest;
  const fetchImpl = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    if (url.endsWith("/v0/wallet/token-standard/allocation-requests")) {
      return jsonResponse({
        allocation_requests: [
          { contract: { contract_id: requestContractId, payload: standardView } },
        ],
      });
    }
    if (url.endsWith("/v0/allocations")) {
      allocationRequest = { url, options, body };
      return jsonResponse({ output: { allocation_cid: allocationContractId } });
    }
    if (body.contractId === requestContractId) {
      return jsonResponse({
        created: {
          createdEvent: { contractId: requestContractId, createArgument: paymentPayload },
        },
        archived: null,
      });
    }
    assert.equal(body.contractId, allocationContractId);
    assert.deepEqual(Object.keys(body.eventFormat.filtersByParty), [context.investorParty]);
    assert.equal(options.headers.Authorization, "Bearer user-token");
    return jsonResponse({
      created: {
        createdEvent: {
          contractId: allocationContractId,
          templateId: "pkg:Splice.Api.Token.AllocationV1:Allocation",
          createArgument: {
            allocation: {
              settlement: standardView.settlement,
              transferLegId: "payment",
              transferLeg: standardView.transferLegs.payment,
            },
          },
        },
      },
      archived: null,
    });
  };
  const client = new CantonClient({ fetchImpl, contextLoader: async () => context });

  const allocation = await client.allocateTokenizedPayment(requestContractId);

  assert.equal(allocation.kind, "allocation");
  assert.equal(allocation.status, "active");
  assert.equal(allocation.contractId, allocationContractId);
  assert.equal(allocation.settlementRefCid, agreementContractId);
  assert.equal(allocation.amount, "10.0");
  assert.equal(allocationRequest.options.headers.Authorization, "Bearer wallet-token");
  assert.equal(allocationRequest.body.settlement.requested_at, 1_787_342_400_000_000);
  assert.equal(allocationRequest.body.settlement.allocate_before, 1_787_346_000_000_000);
  assert.deepEqual(allocationRequest.body.settlement.meta, {
    reason: "purchase-payment",
    asset: "PC-NOTE-2026-A",
  });
  assert.deepEqual(allocationRequest.body.transfer_leg, {
    receiver: context.providerParty,
    amount: "10.0",
    meta: { asset: "PC-NOTE-2026-A" },
  });
});

test("executes an allocation atomically and returns consumed contract evidence", async () => {
  const requestContractId = "00request1234567890";
  const agreementContractId = "00agreement1234567";
  const allocationContractId = "00allocation12345678";
  const preparedContractId = "00prepared1234567890";
  const terms = {
    issuer: context.providerParty,
    investor: context.investorParty,
    verifier: context.providerParty,
    custodian: context.providerParty,
    auditor: context.providerParty,
    assetId: "PC-NOTE-2026-A",
    assetClass: "PRIVATE-CREDIT",
    units: "1000",
    paymentAmount: "10.0",
    paymentInstrumentId: "Amulet",
  };
  const paymentPayload = {
    requestId: "regulated-ui-request",
    terms,
    agreementCid: agreementContractId,
    eligibilityAttestationCid: contractId,
    paymentInstrumentId: { admin: context.dsoParty, id: "Amulet" },
    requestedAt: "2026-08-21T20:00:00Z",
    allocateBefore: "2026-08-21T21:00:00Z",
    settleBefore: "2099-08-21T22:00:00Z",
  };
  const allocationPayload = {
    allocation: {
      settlement: {
        settlementRef: { id: paymentPayload.requestId, cid: agreementContractId },
        settleBefore: paymentPayload.settleBefore,
      },
      transferLegId: "payment",
      transferLeg: {
        sender: context.investorParty,
        receiver: context.providerParty,
        amount: "10.0",
      },
    },
  };
  const disclosures = [
    {
      templateId: "pkg:Splice.AmuletRules:AmuletRules",
      contractId: "00rules1234567890",
      createdEventBlob: "rules-blob",
      synchronizerId: "global-domain::1220domain",
    },
  ];
  let completed = false;
  let completionSubmission;
  const event = (id, payload) =>
    jsonResponse({
      created: {
        createdEvent: {
          contractId: id,
          templateId: id === preparedContractId
            ? "pkg:Settlement.Regulated:PaymentPrepared"
            : undefined,
          createArgument: payload,
        },
      },
      archived: completed && id !== preparedContractId ? { archivedEvent: { contractId: id } } : null,
    });
  const fetchImpl = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    if (url.endsWith("/v0/wallet/token-standard/allocation-requests")) {
      return jsonResponse({ allocation_requests: [] });
    }
    if (url.endsWith("/v0/wallet/balance")) {
      const investor = url.includes(":2903");
      assert.equal(
        options.headers.Authorization,
        `Bearer ${investor ? context.userWalletToken : context.providerWalletToken}`,
      );
      return jsonResponse({
        round: 14,
        effective_unlocked_qty: investor ? "90.0" : completed ? "60.0" : "50.0",
        effective_locked_qty: investor ? (completed ? "0.0" : "10.0") : "0.0",
        total_holding_fees: "0.0",
      });
    }
    if (url.endsWith("/v2/commands/submit-and-wait-for-transaction")) {
      completionSubmission = { url, options, body };
      completed = true;
      return jsonResponse({
        transaction: {
          events: [
            {
              CreatedEvent: {
                contractId: preparedContractId,
                templateId: "pkg:Settlement.Regulated:PaymentPrepared",
              },
            },
          ],
        },
      });
    }
    if (body.contractId === requestContractId) return event(requestContractId, paymentPayload);
    if (body.contractId === allocationContractId) {
      return event(allocationContractId, allocationPayload);
    }
    if (body.contractId === agreementContractId) {
      return event(agreementContractId, {
        terms,
        eligibilityAttestationCid: contractId,
        settleBefore: paymentPayload.settleBefore,
      });
    }
    assert.equal(body.contractId, preparedContractId);
    return event(preparedContractId, {
      terms,
      eligibilityAttestationCid: contractId,
      settleBefore: paymentPayload.settleBefore,
      paymentRef: paymentPayload.requestId,
    });
  };
  const client = new CantonClient({
    fetchImpl,
    contextLoader: async () => context,
    registryContextLoader: async (allocationCid) => {
      assert.equal(allocationCid, allocationContractId);
      return { choiceContextData: { values: { "expire-lock": { tag: "AV_Bool", value: true } } }, disclosedContracts: disclosures };
    },
  });

  const result = await client.completeTokenizedPayment(requestContractId, {
    allocationContractId,
  });

  const commandEnvelope = completionSubmission.body.commands;
  const exercise = commandEnvelope.commands[0].ExerciseCommand;
  assert.equal(completionSubmission.options.headers.Authorization, "Bearer provider-token");
  assert.deepEqual(commandEnvelope.actAs, [context.providerParty]);
  assert.deepEqual(commandEnvelope.disclosedContracts, disclosures);
  assert.equal(exercise.choice, "CompleteTokenizedPayment");
  assert.equal(exercise.choiceArgument.allocationCid, allocationContractId);
  assert.equal(result.paymentRequest.status, "archived");
  assert.equal(result.purchaseAgreement.status, "archived");
  assert.equal(result.allocation.status, "archived");
  assert.equal(result.paymentPrepared.status, "active");
  assert.equal(result.paymentPrepared.balanceEvidence.investorLockedReleased, "10");
  assert.equal(result.paymentPrepared.balanceEvidence.issuerReceived, "10");
  assert.equal(result.paymentPrepared.balanceEvidence.verified, true);
});
