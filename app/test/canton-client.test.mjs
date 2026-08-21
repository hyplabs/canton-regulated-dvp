import assert from "node:assert/strict";
import test from "node:test";
import {
  CantonApiError,
  CantonClient,
  extractCreatedEvent,
  validateAttestationInput,
} from "../lib/canton-client.mjs";

const context = {
  providerToken: "provider-token",
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
