const STORAGE_KEY = "regulated-settlement-scenario-v3";
const LEGACY_STORAGE_KEY = "regulated-settlement-attestation";

const state = {
  role: "verifier",
  health: null,
  contracts: {
    attestation: null,
    offer: null,
    compliance: null,
    agreement: null,
    paymentProposal: null,
    deliveryApproval: null,
    approvedPayment: null,
    paymentRequest: null,
    allocation: null,
    deliveryAllocation: null,
    assetHolding: null,
    settlementReceipt: null,
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
    title: "Await asset reservation",
    summary: "The custodian reserves tokenized units before wallet settlement.",
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
  approveCompliancePanel: document.querySelector("#approve-compliance-panel"),
  paymentAuthorizationPanel: document.querySelector("#payment-authorization-panel"),
  issueButton: document.querySelector("#issue-button"),
  createOfferButton: document.querySelector("#create-offer-button"),
  acceptOfferButton: document.querySelector("#accept-offer-button"),
  approveComplianceButton: document.querySelector("#approve-compliance-button"),
  paymentActionButton: document.querySelector("#payment-action-button"),
  roleEmptyState: document.querySelector("#role-empty-state"),
  emptyStateCopy: document.querySelector("#empty-state-copy"),
  roleName: document.querySelector("#role-name"),
  roleIcon: document.querySelector("#role-icon"),
  actionTitle: document.querySelector("#action-title"),
  actionSummary: document.querySelector("#action-summary"),
  scenarioStatus: document.querySelector("#scenario-status"),
  timelineCount: document.querySelector("#timeline-count"),
  timeline: document.querySelector(".timeline"),
  eligibilityStep: document.querySelector('[data-stage="eligibility"]'),
  offerStep: document.querySelector('[data-stage="offer"]'),
  complianceStep: document.querySelector('[data-stage="compliance"]'),
  paymentStep: document.querySelector('[data-stage="payment"]'),
  deliveryStep: document.querySelector('[data-stage="delivery"]'),
  receiptStep: document.querySelector('[data-stage="receipt"]'),
  eligibilityStepLabel: document.querySelector("#eligibility-step-label"),
  offerStepLabel: document.querySelector("#offer-step-label"),
  complianceStepLabel: document.querySelector("#compliance-step-label"),
  paymentStepLabel: document.querySelector("#payment-step-label"),
  deliveryStepLabel: document.querySelector("#delivery-step-label"),
  receiptStepLabel: document.querySelector("#receipt-step-label"),
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
  if (state.contracts.settlementReceipt?.status === "active") return "settlementReceipt";
  if (state.contracts.allocation?.status === "active") return "allocation";
  if (state.contracts.paymentRequest?.status === "active") return "paymentRequest";
  if (state.contracts.approvedPayment?.status === "active") return "approvedPayment";
  if (state.contracts.deliveryApproval?.status === "active") return "deliveryApproval";
  if (state.contracts.paymentProposal?.status === "active") return "paymentProposal";
  if (state.contracts.agreement?.status === "active") return "agreement";
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
  if (currentPhase === "compliance" && state.role === "verifier") return "approve-compliance";
  if (currentPhase === "agreement" && state.role === "issuer") return "propose-payment";
  if (currentPhase === "paymentProposal" && state.role === "verifier") return "approve-payment";
  if (currentPhase === "deliveryApproval" && state.role === "custodian") return "approve-delivery";
  if (currentPhase === "approvedPayment" && state.role === "investor") return "accept-payment";
  if (currentPhase === "paymentRequest" && state.role === "investor") return "allocate-payment";
  if (currentPhase === "allocation" && state.role === "issuer") return "complete-dvp";
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
  elements.approveComplianceButton.disabled = !enabled || action !== "approve-compliance";
  elements.paymentActionButton.disabled =
    !enabled ||
    ![
      "propose-payment",
      "approve-payment",
      "approve-delivery",
      "accept-payment",
      "allocate-payment",
      "complete-dvp",
    ].includes(action);
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
  elements.approveComplianceButton.innerHTML = busy && action === "approve-compliance"
    ? '<i data-lucide="loader-circle" class="spin"></i><span>Submitting to Canton</span>'
    : '<i data-lucide="clipboard-check"></i><span>Approve compliance</span>';
  const paymentButton = {
    "propose-payment": ["send", "Create payment proposal"],
    "approve-payment": ["badge-check", "Approve payment request"],
    "approve-delivery": ["package-check", "Reserve private-credit units"],
    "accept-payment": ["wallet-cards", "Accept payment request"],
    "allocate-payment": ["circle-dollar-sign", "Allocate Canton Coin"],
    "complete-dvp": ["arrow-left-right", "Execute atomic DvP"],
  }[action] ?? ["send", "Payment authorization"];
  elements.paymentActionButton.innerHTML = busy && paymentButton
    ? '<i data-lucide="loader-circle" class="spin"></i><span>Submitting to Canton</span>'
    : `<i data-lucide="${paymentButton[0]}"></i><span>${paymentButton[1]}</span>`;
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
  if (currentPhase === "compliance") return "Select Verifier to approve compliance.";
  if (currentPhase === "agreement") return "Payment authorization is the next workflow action.";
  if (currentPhase === "paymentProposal") return "Select Verifier to approve the payment request.";
  if (currentPhase === "deliveryApproval") return "Select Custodian to reserve the asset leg.";
  if (currentPhase === "approvedPayment") return "Select Investor to accept the payment request.";
  if (currentPhase === "paymentRequest") return "Select Investor to allocate Canton Coin.";
  if (currentPhase === "allocation") return "Select Issuer to execute both allocations atomically.";
  if (currentPhase === "settlementReceipt") return "The auditor can inspect the final receipt.";
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
    "approve-compliance": {
      title: "Approve compliance review",
      summary: "Authorize this purchase and create the jointly signed agreement.",
    },
    "propose-payment": {
      title: "Propose Canton Coin payment",
      summary: "Create the token-standard payment request for this agreement.",
    },
    "approve-payment": {
      title: "Approve DvP settlement",
      summary: "Verify the agreement, eligibility, both transfer legs, and deadlines.",
    },
    "approve-delivery": {
      title: "Reserve private-credit units",
      summary: "Create the custodian-controlled Token Standard allocation for the asset leg.",
    },
    "accept-payment": {
      title: "Accept Canton Coin payment",
      summary: "Authorize wallet discovery for the investor's payment leg.",
    },
    "allocate-payment": {
      title: "Allocate Canton Coin",
      summary: "Reserve the exact payment amount in the investor's standard wallet.",
    },
    "complete-dvp": {
      title: "Execute atomic DvP",
      summary: "Exchange Canton Coin and tokenized private credit in one all-or-nothing transaction.",
    },
  }[action];
  const idlePhaseCopy = {
    agreement: {
      title: "Purchase agreement active",
      summary: "Issuer, investor, and verifier authority is accumulated on ledger.",
    },
    paymentProposal: {
      title: "Payment proposal active",
      summary: "The proposal is waiting for verifier authorization.",
    },
    deliveryApproval: {
      title: "Custodian approval pending",
      summary: "The private-credit units must be tokenized and reserved for this settlement.",
    },
    approvedPayment: {
      title: "Payment approval active",
      summary: "The approved request is waiting for investor acceptance.",
    },
    paymentRequest: {
      title: "Wallet payment request active",
      summary: "The standard allocation request is available to the investor wallet.",
    },
    allocation: {
      title: "Canton Coin allocation active",
      summary: "The investor wallet has reserved the payment for atomic execution.",
    },
    settlementReceipt: {
      title: "Settlement complete",
      summary: "Both token transfers completed and the DvP receipt is visible to the auditor.",
    },
  }[phase()];
  elements.actionTitle.textContent = actionCopy?.title ?? idlePhaseCopy?.title ?? content.title;
  elements.actionSummary.textContent = actionCopy?.summary ?? idlePhaseCopy?.summary ?? content.summary;

  elements.attestationForm.hidden = action !== "attestation";
  elements.offerForm.hidden = action !== "offer";
  elements.acceptOfferPanel.hidden = action !== "accept-offer";
  elements.approveCompliancePanel.hidden = action !== "approve-compliance";
  elements.paymentAuthorizationPanel.hidden =
    ![
      "propose-payment",
      "approve-payment",
      "approve-delivery",
      "accept-payment",
      "allocate-payment",
      "complete-dvp",
    ].includes(action);
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
  if (action === "approve-compliance") {
    const compliance = state.contracts.compliance;
    document.querySelector("#approve-asset").textContent = compliance.terms.assetId;
    document.querySelector("#approve-units").textContent = `${compliance.terms.units} units`;
    document.querySelector("#approve-payment").textContent =
      `${formatDecimal(compliance.terms.paymentAmount)} ${compliance.terms.paymentInstrumentId}`;
    document.querySelector("#approve-deadline").textContent = formatDate(compliance.settleBefore);
  }
  if (
    [
      "propose-payment",
      "approve-payment",
      "approve-delivery",
      "accept-payment",
      "allocate-payment",
      "complete-dvp",
    ].includes(action)
  ) {
    const paymentContract =
      state.contracts.paymentRequest ??
      state.contracts.approvedPayment ??
      state.contracts.deliveryApproval ??
      state.contracts.paymentProposal ??
      state.contracts.agreement;
    const stageLabel = {
      "propose-payment": "Issuer proposal",
      "approve-payment": "Verifier approval",
      "approve-delivery": "Custodian reservation",
      "accept-payment": "Investor acceptance",
      "allocate-payment": "Wallet allocation",
      "complete-dvp": "Atomic execution",
    }[action];
    document.querySelector("#payment-action-stage").textContent = stageLabel;
    document.querySelector("#payment-action-asset").textContent = paymentContract.terms.assetId;
    document.querySelector("#payment-action-amount").textContent =
      `${formatDecimal(paymentContract.terms.paymentAmount)} ${paymentContract.terms.paymentInstrumentId}`;
    document.querySelector("#payment-action-deadline").textContent =
      formatDate(paymentContract.settleBefore);
  }
  setBusy(state.busy);
  refreshIcons();
}

function setTimelineStep(element, labelElement, status, label) {
  element.className = `timeline-step${status ? ` ${status}` : ""}`;
  labelElement.textContent = label;
}

function renderTimeline() {
  const {
    attestation,
    offer,
    compliance,
    agreement,
    paymentProposal,
    deliveryApproval,
    approvedPayment,
    paymentRequest,
    allocation,
    deliveryAllocation,
    assetHolding,
    settlementReceipt,
  } = state.contracts;
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

  if (agreement) {
    setTimelineStep(elements.offerStep, elements.offerStepLabel, "is-complete", "Accepted");
    setTimelineStep(elements.complianceStep, elements.complianceStepLabel, "is-complete", "Approved");
    const paymentLabel = settlementReceipt
      ? "Transferred"
      : allocation
        ? "Allocated"
        : paymentRequest
          ? "Wallet ready"
          : approvedPayment
            ? "Approved"
            : deliveryApproval
              ? "Approved"
            : paymentProposal
              ? "Proposed"
              : "Pending";
    setTimelineStep(
      elements.paymentStep,
      elements.paymentStepLabel,
      settlementReceipt ? "is-complete" : "is-current",
      paymentLabel,
    );
    const deliveryLabel = settlementReceipt || assetHolding
      ? "Delivered"
      : deliveryAllocation
        ? "Reserved"
        : deliveryApproval
          ? "Approval pending"
          : "Locked";
    setTimelineStep(
      elements.deliveryStep,
      elements.deliveryStepLabel,
      settlementReceipt || assetHolding
        ? "is-complete"
        : deliveryAllocation || deliveryApproval
          ? "is-current"
          : "",
      deliveryLabel,
    );
    setTimelineStep(
      elements.receiptStep,
      elements.receiptStepLabel,
      settlementReceipt ? "is-complete" : allocation ? "is-current" : "",
      settlementReceipt ? "Settled" : allocation ? "Ready" : "Locked",
    );
  } else if (compliance) {
    setTimelineStep(elements.offerStep, elements.offerStepLabel, "is-complete", "Accepted");
    setTimelineStep(elements.complianceStep, elements.complianceStepLabel, "is-current", "Pending");
    setTimelineStep(elements.paymentStep, elements.paymentStepLabel, "", "Locked");
    setTimelineStep(elements.deliveryStep, elements.deliveryStepLabel, "", "Locked");
    setTimelineStep(elements.receiptStep, elements.receiptStepLabel, "", "Locked");
  } else if (offer) {
    setTimelineStep(
      elements.offerStep,
      elements.offerStepLabel,
      offer.status === "active" ? "is-current" : "is-archived",
      offer.status === "active" ? "Open" : "Closed",
    );
    setTimelineStep(elements.complianceStep, elements.complianceStepLabel, "", "Locked");
    setTimelineStep(elements.paymentStep, elements.paymentStepLabel, "", "Locked");
    setTimelineStep(elements.deliveryStep, elements.deliveryStepLabel, "", "Locked");
    setTimelineStep(elements.receiptStep, elements.receiptStepLabel, "", "Locked");
  } else {
    setTimelineStep(elements.offerStep, elements.offerStepLabel, "", "Locked");
    setTimelineStep(elements.complianceStep, elements.complianceStepLabel, "", "Locked");
    setTimelineStep(elements.paymentStep, elements.paymentStepLabel, "", "Locked");
    setTimelineStep(elements.deliveryStep, elements.deliveryStepLabel, "", "Locked");
    setTimelineStep(elements.receiptStep, elements.receiptStepLabel, "", "Locked");
  }

  if (settlementReceipt) {
    elements.timelineCount.textContent = "6 of 6 complete";
    elements.scenarioStatus.className = "scenario-status active";
    elements.scenarioStatus.innerHTML =
      '<i data-lucide="receipt-text"></i><span>Atomic DvP complete</span>';
  } else if (allocation) {
    elements.timelineCount.textContent = "5 of 6 complete";
    elements.scenarioStatus.className = "scenario-status active";
    elements.scenarioStatus.innerHTML =
      '<i data-lucide="arrow-left-right"></i><span>Both legs reserved</span>';
  } else if (paymentRequest) {
    elements.timelineCount.textContent = "4 of 6 complete";
    elements.scenarioStatus.className = "scenario-status active";
    elements.scenarioStatus.innerHTML = paymentRequest.walletDiscovered
      ? '<i data-lucide="wallet-cards"></i><span>Wallet request ready</span>'
      : '<i data-lucide="refresh-cw"></i><span>Wallet discovery pending</span>';
  } else if (approvedPayment) {
    elements.timelineCount.textContent = "4 of 6 complete";
    elements.scenarioStatus.className = "scenario-status offer-open";
    elements.scenarioStatus.innerHTML =
      '<i data-lucide="package-check"></i><span>Asset leg reserved</span>';
  } else if (deliveryApproval) {
    elements.timelineCount.textContent = "3 of 6 complete";
    elements.scenarioStatus.className = "scenario-status offer-open";
    elements.scenarioStatus.innerHTML =
      '<i data-lucide="package-search"></i><span>Custodian approval pending</span>';
  } else if (paymentProposal) {
    elements.timelineCount.textContent = "3 of 6 complete";
    elements.scenarioStatus.className = "scenario-status offer-open";
    elements.scenarioStatus.innerHTML =
      '<i data-lucide="send"></i><span>Payment proposed</span>';
  } else if (agreement) {
    elements.timelineCount.textContent = "3 of 6 complete";
    elements.scenarioStatus.className = "scenario-status offer-open";
    elements.scenarioStatus.innerHTML =
      '<i data-lucide="file-check-2"></i><span>Agreement active</span>';
  } else if (compliance) {
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
  const focusStep = settlementReceipt
    ? elements.receiptStep
    : deliveryAllocation || deliveryApproval
      ? elements.deliveryStep
      : paymentRequest || approvedPayment || paymentProposal || allocation
        ? elements.paymentStep
        : agreement || compliance
          ? elements.complianceStep
          : offer
            ? elements.offerStep
            : elements.eligibilityStep;
  const focusLeft = focusStep.offsetLeft - elements.timeline.offsetLeft;
  elements.timeline.scrollLeft = Math.max(
    0,
    focusLeft - elements.timeline.clientWidth + focusStep.offsetWidth,
  );
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

  if (["allocation", "deliveryAllocation"].includes(contract.kind)) {
    const isCash = contract.kind === "allocation";
    addContractField(
      isCash ? "Payment" : "Private credit",
      `${formatDecimal(contract.amount)} ${contract.instrumentId}`,
    );
    addContractField("Transfer leg", isCash ? "payment" : "delivery");
    addContractField("Sender", shortParty(contract.sender), { code: true });
    addContractField("Receiver", shortParty(contract.receiver), { code: true });
    addContractField("Request ID", contract.requestId, { code: true });
    addContractField("Settlement ref CID", shortContractId(contract.settlementRefCid), {
      code: true,
    });
    addContractField("Settle before", formatDate(contract.settleBefore));
    if (!isCash) {
      addContractField("Locked holding CID", shortContractId(contract.holdingCid), { code: true });
    }
    return;
  }

  if (contract.kind === "assetHolding") {
    addContractField("Asset", contract.instrumentId);
    addContractField("Quantity", `${formatDecimal(contract.amount)} units`);
    addContractField("Owner", shortParty(contract.owner), { code: true });
    addContractField("Issuer", shortParty(contract.issuer), { code: true });
    addContractField("Custodian", shortParty(contract.custodian), { code: true });
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
  if (contract.kind === "settlementReceipt") {
    addContractField("Settled at", formatDate(contract.settledAt));
  } else {
    addContractField("Settle before", formatDate(contract.settleBefore));
  }
  addContractField("Issuer", shortParty(contract.terms.issuer), { code: true });
  addContractField("Investor", shortParty(contract.terms.investor), { code: true });
  if (
    ["compliance", "agreement", "settlementReceipt"].includes(
      contract.kind,
    )
  ) {
    addContractField("Eligibility CID", shortContractId(contract.eligibilityAttestationCid), {
      code: true,
    });
  }
  if (
    ["paymentProposal", "deliveryApproval", "approvedPayment", "paymentRequest"].includes(
      contract.kind,
    )
  ) {
    addContractField("Request ID", contract.requestId, { code: true });
    addContractField("Requested", formatDate(contract.requestedAt));
    addContractField("Allocate before", formatDate(contract.allocateBefore));
    addContractField("Agreement CID", shortContractId(contract.agreementCid), { code: true });
    if (contract.kind === "paymentRequest") {
      addContractField(
        "Wallet discovery",
        contract.walletDiscovered ? "Allocation request visible" : "Discovery pending",
      );
      addContractField(
        "Asset allocation CID",
        shortContractId(contract.deliveryAllocationCid),
        { code: true },
      );
    }
  }
  if (contract.kind === "settlementReceipt") {
    addContractField("Request ID", contract.requestId, { code: true });
    addContractField("Cash allocation", shortContractId(contract.paymentAllocationCid), {
      code: true,
    });
    addContractField("Asset allocation", shortContractId(contract.deliveryAllocationCid), {
      code: true,
    });
    addContractField(
      "Investor holding",
      shortContractId(contract.assetHoldingCids?.[0]),
      { code: true },
    );
    addContractField("Auditor", shortParty(contract.terms.auditor), { code: true });
    if (contract.balanceEvidence) {
      const { before, after, verified, available = true } = contract.balanceEvidence;
      if (before && after) {
        addContractField(
          "Investor lock",
          `${formatDecimal(before.investor.locked)} -> ${formatDecimal(after.investor.locked)} Amulet`,
        );
        addContractField(
          "Issuer available",
          `${formatDecimal(before.issuer.unlocked)} -> ${formatDecimal(after.issuer.unlocked)} Amulet`,
        );
      }
      addContractField(
        "Balance evidence",
        verified
          ? "Exact transfer confirmed"
          : available
            ? "Ledger transfer confirmed; balance snapshot differed"
            : "Ledger transfer confirmed; wallet snapshot unavailable",
      );
    }
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
  const selectedTab = document.querySelector(
    `[data-contract-kind="${state.selectedKind ?? ""}"]`,
  );
  if (selectedTab) {
    const selectedLeft = selectedTab.offsetLeft - elements.contractTabs.offsetLeft;
    elements.contractTabs.scrollLeft = Math.max(
      0,
      selectedLeft - elements.contractTabs.clientWidth + selectedTab.offsetWidth,
    );
  }

  const contract = state.selectedKind ? state.contracts[state.selectedKind] : null;
  elements.inspectorEmpty.hidden = Boolean(contract);
  elements.contractDetails.hidden = !contract;
  if (!contract) {
    elements.refreshButton.disabled = true;
    return;
  }

  const active = contract.status === "active";
  const kindLabel = {
    attestation: "attestation",
    offer: "offer",
    compliance: "compliance",
    agreement: "agreement",
    paymentProposal: "payment proposal",
    deliveryApproval: "custodian approval",
    approvedPayment: "payment approval",
    paymentRequest: "payment request",
    allocation: "Canton Coin allocation",
    deliveryAllocation: "private-credit allocation",
    assetHolding: "private-credit holding",
    settlementReceipt: "DvP receipt",
  }[contract.kind] ?? contract.kind;
  document.querySelector("#contract-status").textContent =
    `${active ? "Active" : "Archived"} ${kindLabel} contract`;
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
  agreement: (id) => `/api/agreements/${encodeURIComponent(id)}`,
  paymentProposal: (id) => `/api/payment-proposals/${encodeURIComponent(id)}`,
  deliveryApproval: (id) => `/api/delivery-approvals/${encodeURIComponent(id)}`,
  approvedPayment: (id) => `/api/approved-payments/${encodeURIComponent(id)}`,
  paymentRequest: (id) => `/api/payment-requests/${encodeURIComponent(id)}`,
  allocation: (id) => `/api/allocations/${encodeURIComponent(id)}`,
  deliveryAllocation: (id) => `/api/delivery-allocations/${encodeURIComponent(id)}`,
  assetHolding: (id) => `/api/asset-holdings/${encodeURIComponent(id)}`,
  settlementReceipt: (id) => `/api/receipts/${encodeURIComponent(id)}`,
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
      agreement: null,
      paymentProposal: null,
      deliveryApproval: null,
      approvedPayment: null,
      paymentRequest: null,
      allocation: null,
      deliveryAllocation: null,
      assetHolding: null,
      settlementReceipt: null,
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
    state.contracts.agreement = null;
    state.contracts.paymentProposal = null;
    state.contracts.deliveryApproval = null;
    state.contracts.approvedPayment = null;
    state.contracts.paymentRequest = null;
    state.contracts.allocation = null;
    state.contracts.deliveryAllocation = null;
    state.contracts.assetHolding = null;
    state.contracts.settlementReceipt = null;
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

elements.approveComplianceButton.addEventListener("click", async () => {
  setBusy(true);
  try {
    const result = await api(
      `/api/compliance-pending/${encodeURIComponent(state.contracts.compliance.contractId)}/approve`,
      { method: "POST" },
    );
    state.contracts.compliance = result.compliancePending;
    state.contracts.agreement = result.purchaseAgreement;
    state.contracts.paymentProposal = null;
    state.contracts.deliveryApproval = null;
    state.contracts.approvedPayment = null;
    state.contracts.paymentRequest = null;
    state.contracts.allocation = null;
    state.contracts.deliveryAllocation = null;
    state.contracts.assetHolding = null;
    state.contracts.settlementReceipt = null;
    state.selectedKind = "agreement";
    persistScenario();
    renderAll();
    showToast("Compliance approved; purchase agreement is active.");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setBusy(false);
  }
});

elements.paymentActionButton.addEventListener("click", async () => {
  const action = currentAction();
  setBusy(true);
  try {
    if (action === "propose-payment") {
      state.contracts.paymentProposal = await api("/api/payment-proposals", {
        method: "POST",
        body: JSON.stringify({ agreementContractId: state.contracts.agreement.contractId }),
      });
      state.selectedKind = "paymentProposal";
      showToast("Tokenized payment proposal committed to Canton.");
    } else if (action === "approve-payment") {
      const result = await api(
        `/api/payment-proposals/${encodeURIComponent(state.contracts.paymentProposal.contractId)}/approve`,
        { method: "POST" },
      );
      state.contracts.paymentProposal = result.paymentProposal;
      state.contracts.deliveryApproval = result.deliveryApproval;
      state.selectedKind = "deliveryApproval";
      showToast("Verifier approved both settlement legs.");
    } else if (action === "approve-delivery") {
      const result = await api(
        `/api/delivery-approvals/${encodeURIComponent(state.contracts.deliveryApproval.contractId)}/approve`,
        { method: "POST" },
      );
      state.contracts.deliveryApproval = result.deliveryApproval;
      state.contracts.approvedPayment = result.approvedPayment;
      state.contracts.deliveryAllocation = result.deliveryAllocation;
      state.selectedKind = "deliveryAllocation";
      showToast("Custodian reserved the tokenized private-credit units.");
    } else if (action === "accept-payment") {
      const result = await api(
        `/api/approved-payments/${encodeURIComponent(state.contracts.approvedPayment.contractId)}/accept`,
        { method: "POST" },
      );
      state.contracts.approvedPayment = result.approvedPayment;
      state.contracts.paymentRequest = result.paymentRequest;
      state.selectedKind = "paymentRequest";
      showToast(
        result.paymentRequest.walletDiscovered
          ? "Investor wallet discovered the payment request."
          : "Payment request is active; wallet discovery is still pending.",
        result.paymentRequest.walletDiscovered ? "success" : "neutral",
      );
    } else if (action === "allocate-payment") {
      state.contracts.allocation = await api(
        `/api/payment-requests/${encodeURIComponent(state.contracts.paymentRequest.contractId)}/allocate`,
        { method: "POST" },
      );
      state.selectedKind = "allocation";
      showToast("Investor wallet allocated Canton Coin for settlement.");
    } else if (action === "complete-dvp") {
      const result = await api(
        `/api/payment-requests/${encodeURIComponent(state.contracts.paymentRequest.contractId)}/complete`,
        {
          method: "POST",
          body: JSON.stringify({
            allocationContractId: state.contracts.allocation.contractId,
          }),
        },
      );
      state.contracts.paymentRequest = result.paymentRequest;
      state.contracts.agreement = result.purchaseAgreement;
      state.contracts.allocation = result.allocation;
      state.contracts.deliveryAllocation = result.deliveryAllocation;
      state.contracts.assetHolding = result.assetHolding;
      state.contracts.settlementReceipt = result.settlementReceipt;
      state.selectedKind = "settlementReceipt";
      showToast(
        result.settlementReceipt.balanceEvidence?.verified
          ? "Atomic DvP complete; exact Canton Coin movement confirmed."
          : "Atomic DvP complete; both token allocations were consumed.",
      );
    }
    persistScenario();
    renderAll();
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
  state.contracts = {
    attestation: null,
    offer: null,
    compliance: null,
    agreement: null,
    paymentProposal: null,
    deliveryApproval: null,
    approvedPayment: null,
    paymentRequest: null,
    allocation: null,
    deliveryAllocation: null,
    assetHolding: null,
    settlementReceipt: null,
  };
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
