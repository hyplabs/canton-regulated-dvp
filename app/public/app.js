const STORAGE_KEY = "regulated-settlement-scenario-v2";
const LEGACY_STORAGE_KEY = "regulated-settlement-attestation";

const state = {
  role: "verifier",
  health: null,
  contracts: {
    attestation: null,
    offer: null,
    compliance: null,
  },
  selectedKind: null,
  busy: false,
};

const roleContent = {
  issuer: {
    icon: "building-2",
    title: "Prepare private-credit offer",
    summary: "Create an offer after eligibility has been recorded.",
  },
  investor: {
    icon: "wallet-cards",
    title: "Review settlement eligibility",
    summary: "Review active contracts visible to the investor party.",
  },
  verifier: {
    icon: "shield-check",
    title: "Issue eligibility attestation",
    summary: "Record eligibility for the intended investor and asset class.",
  },
  custodian: {
    icon: "package-check",
    title: "Await delivery instruction",
    summary: "Custodian action becomes available after payment preparation.",
  },
  auditor: {
    icon: "scan-search",
    title: "Await settlement receipt",
    summary: "The auditor receives visibility only after final settlement.",
  },
};

const elements = {
  networkStatus: document.querySelector("#network-status"),
  networkLabel: document.querySelector("#network-label"),
  ledgerVersion: document.querySelector("#ledger-version"),
  investorParty: document.querySelector("#investor-party"),
  attestationForm: document.querySelector("#attestation-form"),
  offerForm: document.querySelector("#offer-form"),
  acceptOfferPanel: document.querySelector("#accept-offer-panel"),
  issueButton: document.querySelector("#issue-button"),
  createOfferButton: document.querySelector("#create-offer-button"),
  acceptOfferButton: document.querySelector("#accept-offer-button"),
  roleEmptyState: document.querySelector("#role-empty-state"),
  emptyStateCopy: document.querySelector("#empty-state-copy"),
  roleName: document.querySelector("#role-name"),
  roleIcon: document.querySelector("#role-icon"),
  actionTitle: document.querySelector("#action-title"),
  actionSummary: document.querySelector("#action-summary"),
  scenarioStatus: document.querySelector("#scenario-status"),
  timelineCount: document.querySelector("#timeline-count"),
  eligibilityStep: document.querySelector('[data-stage="eligibility"]'),
  offerStep: document.querySelector('[data-stage="offer"]'),
  complianceStep: document.querySelector('[data-stage="compliance"]'),
  eligibilityStepLabel: document.querySelector("#eligibility-step-label"),
  offerStepLabel: document.querySelector("#offer-step-label"),
  complianceStepLabel: document.querySelector("#compliance-step-label"),
  inspectorEmpty: document.querySelector("#inspector-empty"),
  contractDetails: document.querySelector("#contract-details"),
  contractTabs: document.querySelector("#contract-tabs"),
  contractFields: document.querySelector("#contract-fields"),
  refreshButton: document.querySelector("#refresh-button"),
  resetButton: document.querySelector("#reset-button"),
  copyButton: document.querySelector("#copy-button"),
  toast: document.querySelector("#toast"),
};

function refreshIcons() {
  window.lucide?.createIcons({ attrs: { "stroke-width": 1.8 } });
}

function shortParty(party) {
  if (!party || !party.includes("::")) return party ?? "--";
  const [name, fingerprint] = party.split("::");
  return `${name}::${fingerprint.slice(0, 8)}...${fingerprint.slice(-6)}`;
}

function shortContractId(contractId) {
  if (!contractId || contractId.length < 24) return contractId ?? "--";
  return `${contractId.slice(0, 12)}...${contractId.slice(-10)}`;
}

function formatDate(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDecimal(value) {
  return String(value ?? "--")
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "");
}

function showToast(message, tone = "success") {
  elements.toast.textContent = message;
  elements.toast.className = `toast ${tone}`;
  elements.toast.hidden = false;
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 3600);
}

function phase() {
  if (state.contracts.compliance?.status === "active") return "compliance";
  if (state.contracts.offer?.status === "active") return "offer";
  if (state.contracts.attestation?.status === "active") return "eligibility";
  return "empty";
}

function currentAction() {
  const currentPhase = phase();
  if (currentPhase === "empty" && state.role === "verifier") return "attestation";
  if (currentPhase === "eligibility" && state.role === "issuer") return "offer";
  if (currentPhase === "offer" && state.role === "investor") return "accept-offer";
  return null;
}

function persistScenario() {
  const ids = Object.fromEntries(
    Object.entries(state.contracts)
      .filter(([, contract]) => contract?.contractId)
      .map(([kind, contract]) => [kind, contract.contractId]),
  );
  if (Object.keys(ids).length) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

function setBusy(busy) {
  state.busy = busy;
  const action = currentAction();
  const enabled = Boolean(state.health) && !busy;
  elements.issueButton.disabled = !enabled || action !== "attestation";
  elements.createOfferButton.disabled = !enabled || action !== "offer";
  elements.acceptOfferButton.disabled = !enabled || action !== "accept-offer";
  elements.refreshButton.disabled = busy || !state.selectedKind;

  elements.issueButton.innerHTML = busy && action === "attestation"
    ? '<i data-lucide="loader-circle" class="spin"></i><span>Submitting to Canton</span>'
    : '<i data-lucide="badge-check"></i><span>Issue attestation</span>';
  elements.createOfferButton.innerHTML = busy && action === "offer"
    ? '<i data-lucide="loader-circle" class="spin"></i><span>Submitting to Canton</span>'
    : '<i data-lucide="file-plus-2"></i><span>Create asset offer</span>';
  elements.acceptOfferButton.innerHTML = busy && action === "accept-offer"
    ? '<i data-lucide="loader-circle" class="spin"></i><span>Submitting to Canton</span>'
    : '<i data-lucide="file-check-2"></i><span>Accept offer</span>';
  refreshIcons();
}

function renderHealth() {
  const connected = state.health?.status === "connected";
  elements.networkStatus.className = `network-status ${connected ? "is-connected" : "is-error"}`;
  elements.networkLabel.textContent = connected ? "LocalNet connected" : "LocalNet unavailable";
  elements.ledgerVersion.textContent = connected
    ? `Ledger ${state.health.ledgerVersion}`
    : "Ledger offline";
  elements.investorParty.value = connected
    ? shortParty(state.health.roles.investor)
    : "LocalNet unavailable";
  elements.investorParty.title = state.health?.roles?.investor ?? "";
  setBusy(state.busy);
}

function emptyStateMessage() {
  const currentPhase = phase();
  if (currentPhase === "empty") return "Select Verifier to issue the first workflow contract.";
  if (currentPhase === "eligibility") return "Select Issuer to create the asset offer.";
  if (currentPhase === "offer") return "Select Investor to accept the active offer.";
  if (currentPhase === "compliance") return "Compliance review is awaiting verifier approval.";
  return "No action is available in the current state.";
}

function renderRole() {
  const content = roleContent[state.role];
  const action = currentAction();
  document.querySelectorAll(".role-button").forEach((button) => {
    const active = button.dataset.role === state.role;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  elements.roleName.textContent = state.role[0].toUpperCase() + state.role.slice(1);
  elements.roleIcon.setAttribute("data-lucide", content.icon);

  const actionCopy = {
    attestation: {
      title: "Issue eligibility attestation",
      summary: "Record eligibility for the intended investor and asset class.",
    },
    offer: {
      title: "Create private-credit offer",
      summary: "Define the asset quantity, Canton Coin payment, and settlement deadlines.",
    },
    "accept-offer": {
      title: "Accept private-credit offer",
      summary: "Bind the active eligibility attestation to this purchase.",
    },
  }[action];
  elements.actionTitle.textContent = actionCopy?.title ?? (
    phase() === "compliance" ? "Compliance review pending" : content.title
  );
  elements.actionSummary.textContent = actionCopy?.summary ?? (
    phase() === "compliance"
      ? "The accepted offer is waiting for verifier approval."
      : content.summary
  );

  elements.attestationForm.hidden = action !== "attestation";
  elements.offerForm.hidden = action !== "offer";
  elements.acceptOfferPanel.hidden = action !== "accept-offer";
  elements.roleEmptyState.hidden = Boolean(action);
  elements.emptyStateCopy.textContent = emptyStateMessage();

  if (action === "accept-offer") {
    const offer = state.contracts.offer;
    document.querySelector("#accept-asset").textContent = offer.terms.assetId;
    document.querySelector("#accept-units").textContent = `${offer.terms.units} units`;
    document.querySelector("#accept-payment").textContent =
      `${formatDecimal(offer.terms.paymentAmount)} ${offer.terms.paymentInstrumentId}`;
    document.querySelector("#accept-expires").textContent = formatDate(offer.offerExpiresAt);
  }

  setBusy(state.busy);
  refreshIcons();
}

function setTimelineStep(element, labelElement, status, label) {
  element.className = `timeline-step${status ? ` ${status}` : ""}`;
  labelElement.textContent = label;
}

function renderTimeline() {
  const { attestation, offer, compliance } = state.contracts;
  if (attestation) {
    setTimelineStep(
      elements.eligibilityStep,
      elements.eligibilityStepLabel,
      attestation.status === "active" ? "is-complete" : "is-archived",
      attestation.status === "active" ? "Active" : "Withdrawn",
    );
  } else {
    setTimelineStep(elements.eligibilityStep, elements.eligibilityStepLabel, "is-current", "Pending");
  }

  if (compliance) {
    setTimelineStep(elements.offerStep, elements.offerStepLabel, "is-complete", "Accepted");
    setTimelineStep(elements.complianceStep, elements.complianceStepLabel, "is-current", "Pending");
  } else if (offer) {
    setTimelineStep(
      elements.offerStep,
      elements.offerStepLabel,
      offer.status === "active" ? "is-current" : "is-archived",
      offer.status === "active" ? "Open" : "Closed",
    );
    setTimelineStep(elements.complianceStep, elements.complianceStepLabel, "", "Locked");
  } else {
    setTimelineStep(elements.offerStep, elements.offerStepLabel, "", "Locked");
    setTimelineStep(elements.complianceStep, elements.complianceStepLabel, "", "Locked");
  }

  if (compliance) {
    elements.timelineCount.textContent = "2 of 6 complete";
    elements.scenarioStatus.className = "scenario-status pending";
    elements.scenarioStatus.innerHTML =
      '<i data-lucide="clipboard-clock"></i><span>Compliance pending</span>';
  } else if (offer?.status === "active") {
    elements.timelineCount.textContent = "1 of 6 complete";
    elements.scenarioStatus.className = "scenario-status offer-open";
    elements.scenarioStatus.innerHTML = '<i data-lucide="file-clock"></i><span>Offer open</span>';
  } else if (attestation?.status === "active") {
    elements.timelineCount.textContent = "1 of 6 complete";
    elements.scenarioStatus.className = "scenario-status active";
    elements.scenarioStatus.innerHTML =
      '<i data-lucide="shield-check"></i><span>Eligibility active</span>';
  } else {
    elements.timelineCount.textContent = "0 of 6 complete";
    elements.scenarioStatus.className = "scenario-status pending";
    elements.scenarioStatus.innerHTML =
      '<i data-lucide="circle-dashed"></i><span>Awaiting eligibility</span>';
  }
  refreshIcons();
}

function addContractField(label, value, { code = false } = {}) {
  const row = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = label;
  if (code) {
    const codeElement = document.createElement("code");
    codeElement.textContent = value ?? "--";
    codeElement.title = value ?? "";
    description.append(codeElement);
  } else {
    description.textContent = value ?? "--";
  }
  row.append(term, description);
  elements.contractFields.append(row);
}

function renderContractFields(contract) {
  elements.contractFields.replaceChildren();
  if (contract.kind === "attestation") {
    addContractField("Asset class", contract.assetClass);
    addContractField("Expires", formatDate(contract.expiresAt));
    addContractField("Verifier", shortParty(contract.verifier), { code: true });
    addContractField("Investor", shortParty(contract.investor), { code: true });
    return;
  }

  addContractField("Asset", contract.terms.assetId);
  addContractField("Asset class", contract.terms.assetClass);
  addContractField("Quantity", `${contract.terms.units} units`);
  addContractField(
    "Payment",
    `${formatDecimal(contract.terms.paymentAmount)} ${contract.terms.paymentInstrumentId}`,
  );
  if (contract.kind === "offer") {
    addContractField("Offer expires", formatDate(contract.offerExpiresAt));
  }
  addContractField("Settle before", formatDate(contract.settleBefore));
  addContractField("Issuer", shortParty(contract.terms.issuer), { code: true });
  addContractField("Investor", shortParty(contract.terms.investor), { code: true });
  if (contract.kind === "compliance") {
    addContractField("Eligibility CID", shortContractId(contract.eligibilityAttestationCid), {
      code: true,
    });
  }
}

function renderInspector() {
  const availableKinds = Object.entries(state.contracts)
    .filter(([, contract]) => Boolean(contract))
    .map(([kind]) => kind);
  if (!state.selectedKind || !state.contracts[state.selectedKind]) {
    state.selectedKind = availableKinds.at(-1) ?? null;
  }

  elements.contractTabs.hidden = availableKinds.length === 0;
  document.querySelectorAll("[data-contract-kind]").forEach((button) => {
    const available = Boolean(state.contracts[button.dataset.contractKind]);
    button.disabled = !available;
    button.setAttribute(
      "aria-selected",
      String(available && button.dataset.contractKind === state.selectedKind),
    );
  });

  const contract = state.selectedKind ? state.contracts[state.selectedKind] : null;
  elements.inspectorEmpty.hidden = Boolean(contract);
  elements.contractDetails.hidden = !contract;
  if (!contract) {
    elements.refreshButton.disabled = true;
    return;
  }

  const active = contract.status === "active";
  document.querySelector("#contract-status").textContent =
    `${active ? "Active" : "Archived"} ${contract.kind} contract`;
  document.querySelector(".contract-state").className =
    `contract-state ${active ? "active" : "archived"}`;
  document.querySelector("#detail-contract-id").textContent = shortContractId(contract.contractId);
  document.querySelector("#detail-contract-id").title = contract.contractId;
  document.querySelector("#proof-copy").textContent = active
    ? "Created event present; no archive event."
    : "Created and archive events are present.";
  renderContractFields(contract);
  elements.refreshButton.disabled = state.busy;
}

function renderAll() {
  renderTimeline();
  renderInspector();
  renderRole();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message ?? "Request failed.");
  }
  return payload;
}

async function loadHealth() {
  try {
    state.health = await api("/api/health");
  } catch (error) {
    state.health = null;
    showToast(error.message, "error");
  }
  renderHealth();
}

const contractPaths = {
  attestation: (id) => `/api/attestations/${encodeURIComponent(id)}`,
  offer: (id) => `/api/offers/${encodeURIComponent(id)}`,
  compliance: (id) => `/api/compliance-pending/${encodeURIComponent(id)}`,
};

async function refreshScenario({ quiet = false } = {}) {
  const entries = Object.entries(state.contracts).filter(([, contract]) => contract?.contractId);
  if (!entries.length) return;
  setBusy(true);
  const results = await Promise.allSettled(
    entries.map(([kind, contract]) => api(contractPaths[kind](contract.contractId))),
  );
  entries.forEach(([kind], index) => {
    state.contracts[kind] = results[index].status === "fulfilled" ? results[index].value : null;
  });
  persistScenario();
  renderAll();
  setBusy(false);
  if (!quiet) showToast("Scenario contracts refreshed from Canton.");
}

elements.attestationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);
  try {
    state.contracts = {
      attestation: await api("/api/attestations", {
        method: "POST",
        body: JSON.stringify({
          assetClass: document.querySelector("#asset-class").value,
          validForHours: Number(document.querySelector("#validity").value),
        }),
      }),
      offer: null,
      compliance: null,
    };
    state.selectedKind = "attestation";
    persistScenario();
    renderAll();
    showToast("Eligibility attestation committed to Canton.");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setBusy(false);
  }
});

elements.offerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);
  try {
    state.contracts.offer = await api("/api/offers", {
      method: "POST",
      body: JSON.stringify({
        attestationContractId: state.contracts.attestation.contractId,
        assetId: document.querySelector("#asset-id").value,
        units: Number(document.querySelector("#asset-units").value),
        paymentAmount: document.querySelector("#payment-amount").value,
        offerValidForMinutes: Number(document.querySelector("#offer-validity").value),
        settleInHours: Number(document.querySelector("#settlement-window").value),
      }),
    });
    state.selectedKind = "offer";
    persistScenario();
    renderAll();
    showToast("Asset offer committed to Canton.");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setBusy(false);
  }
});

elements.acceptOfferButton.addEventListener("click", async () => {
  setBusy(true);
  try {
    const result = await api(
      `/api/offers/${encodeURIComponent(state.contracts.offer.contractId)}/accept`,
      {
        method: "POST",
        body: JSON.stringify({
          attestationContractId: state.contracts.attestation.contractId,
        }),
      },
    );
    state.contracts.offer = result.offer;
    state.contracts.compliance = result.compliancePending;
    state.selectedKind = "compliance";
    persistScenario();
    renderAll();
    showToast("Offer accepted; compliance review is active.");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setBusy(false);
  }
});

document.querySelectorAll(".role-button").forEach((button) => {
  button.addEventListener("click", () => {
    state.role = button.dataset.role;
    renderRole();
  });
});

document.querySelectorAll("[data-contract-kind]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!state.contracts[button.dataset.contractKind]) return;
    state.selectedKind = button.dataset.contractKind;
    renderInspector();
  });
});

elements.refreshButton.addEventListener("click", () => refreshScenario());
elements.resetButton.addEventListener("click", () => {
  state.contracts = { attestation: null, offer: null, compliance: null };
  state.selectedKind = null;
  persistScenario();
  renderAll();
  showToast("Workspace reset. Ledger contracts were left unchanged.", "neutral");
});
elements.copyButton.addEventListener("click", async () => {
  const contract = state.selectedKind ? state.contracts[state.selectedKind] : null;
  if (!contract) return;
  try {
    await navigator.clipboard.writeText(contract.contractId);
    showToast("Contract ID copied.");
  } catch {
    showToast("Contract ID could not be copied.", "error");
  }
});

function loadStoredContracts() {
  let ids = {};
  try {
    ids = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  const legacyAttestationId = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!ids.attestation && legacyAttestationId) ids.attestation = legacyAttestationId;
  for (const kind of Object.keys(state.contracts)) {
    if (ids[kind]) state.contracts[kind] = { contractId: ids[kind] };
  }
}

async function initialize() {
  refreshIcons();
  renderAll();
  await loadHealth();
  loadStoredContracts();
  await refreshScenario({ quiet: true });
}

initialize();
