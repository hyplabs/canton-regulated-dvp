import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MODULE_ID = "#canton-regulated-settlement-model:Settlement.Regulated";
const templateId = (template) => `${MODULE_ID}:${template}`;

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
  --arg userToken "$APP_USER_PARTICIPANT_ADMIN_TOKEN" \
  --arg providerParty "$provider_party" \
  --arg investorParty "$APP_USER_PARTY" \
  '{providerToken:$providerToken,userToken:$userToken,
    providerParty:$providerParty,investorParty:$investorParty}'
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

function validateContractId(contractId) {
  if (typeof contractId !== "string" || !/^[A-Za-z0-9:#._-]{8,512}$/.test(contractId)) {
    throw new CantonApiError("Contract ID is invalid.", {
      status: 400,
      code: "INVALID_CONTRACT_ID",
    });
  }
  return contractId;
}

export function validateOfferInput(input = {}) {
  const attestationContractId = validateContractId(input.attestationContractId);
  const assetId = typeof input.assetId === "string" ? input.assetId.trim() : "";
  const units = Number(input.units);
  const paymentAmount = String(input.paymentAmount ?? "").trim();
  const offerValidForMinutes = Number(input.offerValidForMinutes);
  const settleInHours = Number(input.settleInHours);

  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{1,63}$/.test(assetId)) {
    throw new CantonApiError("Asset ID must contain 2-64 letters, numbers, dots, slashes, or hyphens.", {
      status: 400,
      code: "INVALID_ASSET_ID",
    });
  }
  if (!Number.isSafeInteger(units) || units < 1 || units > 1_000_000_000) {
    throw new CantonApiError("Units must be a whole number between 1 and 1,000,000,000.", {
      status: 400,
      code: "INVALID_UNITS",
    });
  }
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,10})?$/.test(paymentAmount) || Number(paymentAmount) <= 0) {
    throw new CantonApiError("Payment amount must be a positive decimal with at most 10 decimal places.", {
      status: 400,
      code: "INVALID_PAYMENT_AMOUNT",
    });
  }
  if (
    !Number.isInteger(offerValidForMinutes) ||
    offerValidForMinutes < 5 ||
    offerValidForMinutes > 1_440
  ) {
    throw new CantonApiError("Offer validity must be between 5 and 1,440 minutes.", {
      status: 400,
      code: "INVALID_OFFER_VALIDITY",
    });
  }
  if (!Number.isInteger(settleInHours) || settleInHours < 1 || settleInHours > 168) {
    throw new CantonApiError("Settlement window must be between 1 and 168 hours.", {
      status: 400,
      code: "INVALID_SETTLEMENT_WINDOW",
    });
  }
  if (settleInHours * 60 <= offerValidForMinutes) {
    throw new CantonApiError("Settlement must remain open after the offer expires.", {
      status: 400,
      code: "INVALID_DEADLINE_ORDER",
    });
  }

  return {
    attestationContractId,
    assetId,
    units: String(units),
    paymentAmount,
    offerValidForMinutes,
    settleInHours,
  };
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
    userLedgerUrl = process.env.CANTON_USER_LEDGER_URL ?? "http://127.0.0.1:2975",
  } = {}) {
    this.fetch = fetchImpl;
    this.contextLoader = contextLoader;
    this.providerLedgerUrl = providerLedgerUrl.replace(/\/$/, "");
    this.userLedgerUrl = userLedgerUrl.replace(/\/$/, "");
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
              templateId: templateId("EligibilityAttestation"),
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
    const contract = await this.getContract(contractId, "attestation");
    const { created, payload } = contract;
    return {
      kind: "attestation",
      contractId,
      templateId: created.templateId ?? templateId("EligibilityAttestation"),
      status: contract.status,
      verifier: payload.verifier,
      investor: payload.investor,
      assetClass: payload.assetClass,
      expiresAt: payload.expiresAt,
    };
  }

  async createAssetOffer(input) {
    const values = validateOfferInput(input);
    const [context, attestation] = await Promise.all([
      this.getContext(),
      this.getEligibilityAttestation(values.attestationContractId),
    ]);
    if (attestation.status !== "active") {
      throw new CantonApiError("Eligibility attestation is not active.", {
        status: 409,
        code: "ATTESTATION_INACTIVE",
      });
    }

    const now = Date.now();
    const createArguments = {
      terms: {
        issuer: context.providerParty,
        investor: context.investorParty,
        verifier: context.providerParty,
        custodian: context.providerParty,
        auditor: context.providerParty,
        assetId: values.assetId,
        assetClass: attestation.assetClass,
        units: values.units,
        paymentAmount: values.paymentAmount,
        paymentInstrumentId: "Amulet",
      },
      offerExpiresAt: new Date(now + values.offerValidForMinutes * 60 * 1000).toISOString(),
      settleBefore: new Date(now + values.settleInHours * 60 * 60 * 1000).toISOString(),
    };
    const command = {
      CreateCommand: {
        templateId: templateId("AssetOffer"),
        createArguments,
      },
    };
    const transaction = await this.submitCommand({
      command,
      commandName: "ui-asset-offer",
      actor: context.providerParty,
      token: context.providerToken,
      ledgerUrl: this.providerLedgerUrl,
    });
    const created = extractCreatedEvent(transaction, ":Settlement.Regulated:AssetOffer");
    return this.getAssetOffer(created.contractId);
  }

  async getAssetOffer(contractId) {
    const contract = await this.getContract(contractId, "asset offer");
    const { created, payload } = contract;
    return {
      kind: "offer",
      contractId,
      templateId: created.templateId ?? templateId("AssetOffer"),
      status: contract.status,
      terms: payload.terms,
      offerExpiresAt: payload.offerExpiresAt,
      settleBefore: payload.settleBefore,
    };
  }

  async acceptAssetOffer(offerContractId, input = {}) {
    validateContractId(offerContractId);
    const attestationContractId = validateContractId(input.attestationContractId);
    const [context, offer, attestation] = await Promise.all([
      this.getContext(),
      this.getAssetOffer(offerContractId),
      this.getEligibilityAttestation(attestationContractId),
    ]);
    if (offer.status !== "active") {
      throw new CantonApiError("Asset offer is not active.", {
        status: 409,
        code: "OFFER_INACTIVE",
      });
    }
    if (attestation.status !== "active") {
      throw new CantonApiError("Eligibility attestation is not active.", {
        status: 409,
        code: "ATTESTATION_INACTIVE",
      });
    }

    const command = {
      ExerciseCommand: {
        templateId: templateId("AssetOffer"),
        contractId: offerContractId,
        choice: "AcceptOffer",
        choiceArgument: { eligibilityAttestationCid: attestationContractId },
      },
    };
    const transaction = await this.submitCommand({
      command,
      commandName: "ui-accept-offer",
      actor: context.investorParty,
      token: context.userToken,
      ledgerUrl: this.userLedgerUrl,
    });
    const created = extractCreatedEvent(transaction, ":Settlement.Regulated:CompliancePending");
    const [archivedOffer, compliancePending] = await Promise.all([
      this.getAssetOffer(offerContractId),
      this.getCompliancePending(created.contractId),
    ]);
    return { offer: archivedOffer, compliancePending };
  }

  async getCompliancePending(contractId) {
    const contract = await this.getContract(contractId, "compliance review");
    const { created, payload } = contract;
    return {
      kind: "compliance",
      contractId,
      templateId: created.templateId ?? templateId("CompliancePending"),
      status: contract.status,
      terms: payload.terms,
      eligibilityAttestationCid: payload.eligibilityAttestationCid,
      settleBefore: payload.settleBefore,
    };
  }

  async approveCompliance(complianceContractId) {
    validateContractId(complianceContractId);
    const [context, compliancePending] = await Promise.all([
      this.getContext(),
      this.getCompliancePending(complianceContractId),
    ]);
    if (compliancePending.status !== "active") {
      throw new CantonApiError("Compliance review is not active.", {
        status: 409,
        code: "COMPLIANCE_INACTIVE",
      });
    }

    const transaction = await this.submitCommand({
      command: {
        ExerciseCommand: {
          templateId: templateId("CompliancePending"),
          contractId: complianceContractId,
          choice: "ApproveCompliance",
          choiceArgument: {},
        },
      },
      commandName: "ui-approve-compliance",
      actor: context.providerParty,
      token: context.providerToken,
      ledgerUrl: this.providerLedgerUrl,
    });
    const created = extractCreatedEvent(transaction, ":Settlement.Regulated:PurchaseAgreement");
    const [archivedCompliance, purchaseAgreement] = await Promise.all([
      this.getCompliancePending(complianceContractId),
      this.getPurchaseAgreement(created.contractId),
    ]);
    return { compliancePending: archivedCompliance, purchaseAgreement };
  }

  async getPurchaseAgreement(contractId) {
    const contract = await this.getContract(contractId, "purchase agreement");
    const { created, payload } = contract;
    return {
      kind: "agreement",
      contractId,
      templateId: created.templateId ?? templateId("PurchaseAgreement"),
      status: contract.status,
      terms: payload.terms,
      eligibilityAttestationCid: payload.eligibilityAttestationCid,
      settleBefore: payload.settleBefore,
    };
  }

  async getContract(contractId, label) {
    validateContractId(contractId);
    const context = await this.getContext();
    const events = await this.request(
      "POST",
      "/v2/events/events-by-contract-id",
      {
        contractId,
        eventFormat: {
          filtersByParty: { [context.providerParty]: {} },
          verbose: true,
        },
      },
      context.providerToken,
    );
    const created = normalizeCreatedEvent(events.created);
    if (!created) {
      throw new CantonApiError(`The ${label} is not visible to the provider.`, {
        status: 404,
        code: "CONTRACT_NOT_FOUND",
      });
    }
    return {
      created,
      payload: created.createArgument ?? created.createArguments ?? {},
      status: events.archived ? "archived" : "active",
    };
  }

  async submitCommand({ command, commandName, actor, token, ledgerUrl }) {
    return this.request(
      "POST",
      "/v2/commands/submit-and-wait-for-transaction",
      {
        commands: {
          commands: [command],
          commandId: `${commandName}-${Date.now()}-${crypto.randomUUID()}`,
          actAs: [actor],
          readAs: [actor],
          deduplicationPeriod: { Empty: {} },
          disclosedContracts: [],
        },
      },
      token,
      ledgerUrl,
    );
  }

  async request(method, path, body, token, ledgerUrl = this.providerLedgerUrl) {
    let response;
    try {
      response = await this.fetch(`${ledgerUrl}${path}`, {
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
