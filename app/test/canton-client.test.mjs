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
  userToken: "user-token",
  providerParty: "Provider::1220abcdef",
  investorParty: "Investor::1220fedcba",
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
