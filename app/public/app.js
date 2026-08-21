const state = {
  role: "verifier",
  health: null,
  attestation: null,
  busy: false,
};

const roleContent = {
  issuer: {
    icon: "building-2",
    title: "Prepare private-credit offer",
    summary: "Eligibility must be active before an offer can be accepted.",
  },
  investor: {
    icon: "wallet-cards",
    title: "Review settlement eligibility",
    summary: "The investor observes attestations issued for its party.",
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
  form: document.querySelector("#attestation-form"),
  issueButton: document.querySelector("#issue-button"),
  roleEmptyState: document.querySelector("#role-empty-state"),
  emptyStateCopy: document.querySelector("#empty-state-copy"),
  roleName: document.querySelector("#role-name"),
  roleIcon: document.querySelector("#role-icon"),
  actionTitle: document.querySelector("#action-title"),
  actionSummary: document.querySelector("#action-summary"),
  scenarioStatus: document.querySelector("#scenario-status"),
  timelineCount: document.querySelector("#timeline-count"),
  eligibilityStep: document.querySelector('[data-stage="eligibility"]'),
  eligibilityStepLabel: document.querySelector("#eligibility-step-label"),
  inspectorEmpty: document.querySelector("#inspector-empty"),
  contractDetails: document.querySelector("#contract-details"),
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

function showToast(message, tone = "success") {
  elements.toast.textContent = message;
  elements.toast.className = `toast ${tone}`;
  elements.toast.hidden = false;
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 3600);
}

function setBusy(busy) {
  state.busy = busy;
  elements.issueButton.disabled = busy || !state.health || state.role !== "verifier";
  elements.refreshButton.disabled = busy || !state.attestation;
  elements.issueButton.innerHTML = busy
    ? '<i data-lucide="loader-circle" class="spin"></i><span>Submitting to Canton</span>'
    : '<i data-lucide="badge-check"></i><span>Issue attestation</span>';
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

function renderRole() {
  const content = roleContent[state.role];
  const verifierComplete = state.role === "verifier" && state.attestation;
  document.querySelectorAll(".role-button").forEach((button) => {
    const active = button.dataset.role === state.role;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  elements.roleName.textContent = state.role[0].toUpperCase() + state.role.slice(1);
  elements.roleIcon.setAttribute("data-lucide", content.icon);
  elements.actionTitle.textContent = verifierComplete
    ? "Eligibility attestation recorded"
    : content.title;
  elements.actionSummary.textContent = verifierComplete
    ? "The verifier has no further action in the current eligibility state."
    : content.summary;

  const canIssue = state.role === "verifier" && !state.attestation;
  elements.form.hidden = !canIssue;
  elements.roleEmptyState.hidden = canIssue;
  if (!canIssue) {
    elements.emptyStateCopy.textContent = state.attestation
      ? `${state.role[0].toUpperCase() + state.role.slice(1)} has no action in the current eligibility state.`
      : "Select Verifier to issue the first workflow contract.";
  }
  setBusy(state.busy);
  refreshIcons();
}

function renderAttestation() {
  const contract = state.attestation;
  if (!contract) {
    elements.inspectorEmpty.hidden = false;
    elements.contractDetails.hidden = true;
    elements.scenarioStatus.className = "scenario-status pending";
    elements.scenarioStatus.innerHTML = '<i data-lucide="circle-dashed"></i><span>Awaiting eligibility</span>';
    elements.timelineCount.textContent = "0 of 6 complete";
    elements.eligibilityStep.className = "timeline-step is-current";
    elements.eligibilityStepLabel.textContent = "Pending";
    renderRole();
    return;
  }

  const active = contract.status === "active";
  elements.inspectorEmpty.hidden = true;
  elements.contractDetails.hidden = false;
  elements.scenarioStatus.className = `scenario-status ${active ? "active" : "archived"}`;
  elements.scenarioStatus.innerHTML = active
    ? '<i data-lucide="shield-check"></i><span>Eligibility active</span>'
    : '<i data-lucide="shield-x"></i><span>Eligibility withdrawn</span>';
  elements.timelineCount.textContent = active ? "1 of 6 complete" : "0 of 6 complete";
  elements.eligibilityStep.className = `timeline-step ${active ? "is-complete" : "is-archived"}`;
  elements.eligibilityStepLabel.textContent = active ? "Active" : "Withdrawn";
  document.querySelector("#contract-status").textContent = active ? "Active contract" : "Archived contract";
  document.querySelector(".contract-state").className = `contract-state ${active ? "active" : "archived"}`;
  document.querySelector("#detail-asset-class").textContent = contract.assetClass;
  document.querySelector("#detail-expires").textContent = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(contract.expiresAt));
  document.querySelector("#detail-verifier").textContent = shortParty(contract.verifier);
  document.querySelector("#detail-verifier").title = contract.verifier;
  document.querySelector("#detail-investor").textContent = shortParty(contract.investor);
  document.querySelector("#detail-investor").title = contract.investor;
  document.querySelector("#detail-contract-id").textContent = shortContractId(contract.contractId);
  document.querySelector("#detail-contract-id").title = contract.contractId;
  document.querySelector("#proof-copy").textContent = active
    ? "Created event present; no archive event."
    : "Created and archive events are present.";
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

async function refreshAttestation({ quiet = false } = {}) {
  if (!state.attestation?.contractId) return;
  setBusy(true);
  try {
    state.attestation = await api(
      `/api/attestations/${encodeURIComponent(state.attestation.contractId)}`,
    );
    localStorage.setItem("regulated-settlement-attestation", state.attestation.contractId);
    renderAttestation();
    if (!quiet) showToast("Contract state refreshed from Canton.");
  } catch (error) {
    if (quiet) {
      state.attestation = null;
      localStorage.removeItem("regulated-settlement-attestation");
      renderAttestation();
    } else {
      showToast(error.message, "error");
    }
  } finally {
    setBusy(false);
  }
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);
  try {
    state.attestation = await api("/api/attestations", {
      method: "POST",
      body: JSON.stringify({
        assetClass: document.querySelector("#asset-class").value,
        validForHours: Number(document.querySelector("#validity").value),
      }),
    });
    localStorage.setItem("regulated-settlement-attestation", state.attestation.contractId);
    renderAttestation();
    showToast("Eligibility attestation committed to Canton.");
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

elements.refreshButton.addEventListener("click", () => refreshAttestation());
elements.resetButton.addEventListener("click", () => {
  state.attestation = null;
  localStorage.removeItem("regulated-settlement-attestation");
  renderAttestation();
  showToast("Workspace reset. Ledger contracts were left unchanged.", "neutral");
});
elements.copyButton.addEventListener("click", async () => {
  if (!state.attestation) return;
  await navigator.clipboard.writeText(state.attestation.contractId);
  showToast("Contract ID copied.");
});

async function initialize() {
  refreshIcons();
  renderRole();
  await loadHealth();
  const savedContractId = localStorage.getItem("regulated-settlement-attestation");
  if (savedContractId) {
    state.attestation = { contractId: savedContractId };
    await refreshAttestation({ quiet: true });
  }
}

initialize();
