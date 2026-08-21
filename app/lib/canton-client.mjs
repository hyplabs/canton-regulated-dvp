import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const TEMPLATE_ID =
  "#canton-regulated-settlement-model:Settlement.Regulated:EligibilityAttestation";

const CONTEXT_SCRIPT = String.raw`
set -eo pipefail
DO_INIT=false
source /app/utils.sh
source /app/app-provider-auth.sh 2>/dev/null
provider_token=$APP_PROVIDER_PARTICIPANT_ADMIN_TOKEN
provider_party=$APP_PROVIDER_PARTY
source /app/app-user-auth.sh 2>/dev/null
jq -nc \
  --arg providerToken "$provider_token" \
  --arg providerParty "$provider_party" \
  --arg investorParty "$APP_USER_PARTY" \
  '{providerToken:$providerToken,providerParty:$providerParty,investorParty:$investorParty}'
`;

export class CantonApiError extends Error {
  constructor(message, { status = 502, code = "CANTON_API_ERROR", details } = {}) {
    super(message);
    this.name = "CantonApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function validateAttestationInput(input = {}) {
  const assetClass = typeof input.assetClass === "string" ? input.assetClass.trim() : "";
  const validForHours = Number(input.validForHours);

  if (!/^[A-Za-z0-9][A-Za-z0-9 /_-]{1,63}$/.test(assetClass)) {
    throw new CantonApiError(
      "Asset class must contain 2-64 letters, numbers, spaces, slashes, underscores, or hyphens.",
      { status: 400, code: "INVALID_ASSET_CLASS" },
    );
  }

  if (!Number.isInteger(validForHours) || validForHours < 1 || validForHours > 168) {
    throw new CantonApiError("Validity must be between 1 and 168 hours.", {
      status: 400,
      code: "INVALID_VALIDITY",
    });
  }

  return { assetClass, validForHours };
}

export function extractCreatedEvent(transactionResponse, templateSuffix) {
  const events = transactionResponse?.transaction?.events ?? [];
  const event = events
    .map((item) => item?.CreatedEvent)
    .find((created) => created?.templateId?.endsWith(templateSuffix));

  if (!event?.contractId) {
    throw new CantonApiError(`Canton did not create ${templateSuffix}.`, {
      code: "CREATED_CONTRACT_MISSING",
      details: transactionResponse,
    });
  }

  return event;
}

export async function loadLocalNetContext() {
  try {
    const { stdout } = await execFileAsync(
      "docker",
      ["exec", "splice-onboarding", "bash", "-lc", CONTEXT_SCRIPT],
      { maxBuffer: 1024 * 1024 },
    );
    return JSON.parse(stdout.trim());
  } catch (error) {
    throw new CantonApiError(
      "Quickstart LocalNet context is unavailable. Start the stack and try again.",
      { code: "LOCALNET_UNAVAILABLE", details: error.message },
    );
  }
}

function normalizeCreatedEvent(created) {
  return created?.createdEvent ?? created?.CreatedEvent ?? created;
}

export class CantonClient {
  constructor({
    fetchImpl = globalThis.fetch,
    contextLoader = loadLocalNetContext,
    providerLedgerUrl = process.env.CANTON_PROVIDER_LEDGER_URL ?? "http://127.0.0.1:3975",
  } = {}) {
    this.fetch = fetchImpl;
    this.contextLoader = contextLoader;
    this.providerLedgerUrl = providerLedgerUrl.replace(/\/$/, "");
    this.context = null;
  }

  async getContext() {
    if (!this.context) {
      this.context = await this.contextLoader();
    }
    return this.context;
  }

  async health() {
    const [version, context] = await Promise.all([
      this.request("GET", "/v2/version"),
      this.getContext(),
    ]);

    return {
      status: "connected",
      network: "Quickstart LocalNet",
      ledgerVersion: version.version,
      roles: {
        provider: context.providerParty,
        investor: context.investorParty,
      },
    };
  }

  async createEligibilityAttestation(input) {
    const { assetClass, validForHours } = validateAttestationInput(input);
    const context = await this.getContext();
    const expiresAt = new Date(Date.now() + validForHours * 60 * 60 * 1000).toISOString();
    const commandId = `ui-attestation-${Date.now()}-${crypto.randomUUID()}`;
    const createArguments = {
      verifier: context.providerParty,
      investor: context.investorParty,
      assetClass,
      expiresAt,
    };
    const body = {
      commands: {
        commands: [
          {
            CreateCommand: {
              templateId: TEMPLATE_ID,
              createArguments,
            },
          },
        ],
        commandId,
        actAs: [context.providerParty],
        readAs: [context.providerParty],
        deduplicationPeriod: { Empty: {} },
        disclosedContracts: [],
      },
    };

    const transaction = await this.request(
      "POST",
      "/v2/commands/submit-and-wait-for-transaction",
      body,
      context.providerToken,
    );
    const created = extractCreatedEvent(
      transaction,
      ":Settlement.Regulated:EligibilityAttestation",
    );

    return this.getEligibilityAttestation(created.contractId);
  }

  async getEligibilityAttestation(contractId) {
    if (typeof contractId !== "string" || !/^[A-Za-z0-9:#._-]{8,512}$/.test(contractId)) {
      throw new CantonApiError("Contract ID is invalid.", {
        status: 400,
        code: "INVALID_CONTRACT_ID",
      });
    }

    const context = await this.getContext();
    const body = {
      contractId,
      eventFormat: {
        filtersByParty: { [context.providerParty]: {} },
        verbose: true,
      },
    };
    const events = await this.request(
      "POST",
      "/v2/events/events-by-contract-id",
      body,
      context.providerToken,
    );
    const created = normalizeCreatedEvent(events.created);

    if (!created) {
      throw new CantonApiError("The attestation is not visible to the provider.", {
        status: 404,
        code: "CONTRACT_NOT_FOUND",
      });
    }

    const payload = created.createArgument ?? created.createArguments ?? {};
    return {
      contractId,
      templateId: created.templateId ?? TEMPLATE_ID,
      status: events.archived ? "archived" : "active",
      verifier: payload.verifier,
      investor: payload.investor,
      assetClass: payload.assetClass,
      expiresAt: payload.expiresAt,
    };
  }

  async request(method, path, body, token) {
    let response;
    try {
      response = await this.fetch(`${this.providerLedgerUrl}${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      throw new CantonApiError("Could not reach the Canton Ledger API.", {
        code: "LEDGER_UNAVAILABLE",
        details: error.message,
      });
    }

    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text };
      }
    }

    if (!response.ok) {
      throw new CantonApiError(
        payload.cause ?? payload.message ?? `Canton returned HTTP ${response.status}.`,
        {
          status: response.status >= 400 && response.status < 500 ? response.status : 502,
          code: payload.code ?? "LEDGER_REQUEST_FAILED",
          details: payload,
        },
      );
    }

    return payload;
  }
}
