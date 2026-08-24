import { expect, test } from "@playwright/test";

const health = {
  status: "connected",
  network: "Quickstart LocalNet",
  ledgerVersion: "3.5.7",
  roles: {
    provider: "app_provider_quickstart::1220provider",
    investor: "app_user_quickstart::1220investor",
  },
};

const attestation = {
  kind: "attestation",
  contractId: "00abcdef1234567890abcdef1234567890",
  templateId: "pkg:Settlement.Regulated:EligibilityAttestation",
  status: "active",
  verifier: health.roles.provider,
  investor: health.roles.investor,
  assetClass: "PRIVATE-CREDIT",
  expiresAt: "2026-08-22T00:00:00Z",
};

const offer = {
  kind: "offer",
  contractId: "00offer1234567890abcdef1234567890",
  templateId: "pkg:Settlement.Regulated:AssetOffer",
  status: "active",
  terms: {
    issuer: health.roles.provider,
    investor: health.roles.investor,
    verifier: health.roles.provider,
    custodian: health.roles.provider,
    auditor: health.roles.provider,
    assetId: "PC-NOTE-2026-A",
    assetClass: "PRIVATE-CREDIT",
    units: "1000",
    paymentAmount: "10.0",
    paymentInstrumentId: "Amulet",
  },
  offerExpiresAt: "2026-08-21T22:00:00Z",
  settleBefore: "2026-08-22T00:00:00Z",
};

const compliancePending = {
  kind: "compliance",
  contractId: "00compliance1234567890abcdef1234",
  templateId: "pkg:Settlement.Regulated:CompliancePending",
  status: "active",
  terms: offer.terms,
  eligibilityAttestationCid: attestation.contractId,
  settleBefore: offer.settleBefore,
};

const purchaseAgreement = {
  kind: "agreement",
  contractId: "00agreement1234567890abcdef123456",
  templateId: "pkg:Settlement.Regulated:PurchaseAgreement",
  status: "active",
  terms: offer.terms,
  eligibilityAttestationCid: attestation.contractId,
  settleBefore: offer.settleBefore,
};

const paymentBase = {
  requestId: "regulated-ui-request",
  terms: offer.terms,
  agreementCid: purchaseAgreement.contractId,
  eligibilityAttestationCid: attestation.contractId,
  paymentInstrumentId: { admin: "DSO::1220dso", id: "Amulet" },
  assetInstrumentId: { admin: health.roles.provider, id: offer.terms.assetId },
  requestedAt: "2026-08-21T20:00:00Z",
  allocateBefore: "2026-08-21T21:00:00Z",
  settleBefore: offer.settleBefore,
};

const deliveryApproval = {
  ...paymentBase,
  kind: "deliveryApproval",
  contractId: "00deliveryapproval1234567890abcdef",
  status: "active",
};

const deliveryAllocation = {
  kind: "deliveryAllocation",
  contractId: "00deliveryallocation1234567890abc",
  templateId: "pkg:Settlement.PrivateCreditToken:PrivateCreditAllocation",
  status: "active",
  requestId: paymentBase.requestId,
  settlementRefCid: purchaseAgreement.contractId,
  amount: "1000.0",
  instrumentId: offer.terms.assetId,
  sender: health.roles.provider,
  receiver: health.roles.investor,
  settleBefore: paymentBase.settleBefore,
  holdingCid: "00lockedholding1234567890abcdef123",
};

const paymentProposal = {
  ...paymentBase,
  kind: "paymentProposal",
  contractId: "00proposal1234567890abcdef1234567",
  status: "active",
};

const approvedPayment = {
  ...paymentBase,
  deliveryAllocationCid: deliveryAllocation.contractId,
  kind: "approvedPayment",
  contractId: "00approved1234567890abcdef1234567",
  status: "active",
};

const paymentRequest = {
  ...paymentBase,
  deliveryAllocationCid: deliveryAllocation.contractId,
  kind: "paymentRequest",
  contractId: "00request1234567890abcdef12345678",
  status: "active",
  walletDiscovered: true,
};

const allocation = {
  kind: "allocation",
  contractId: "00allocation1234567890abcdef123456",
  templateId: "pkg:Splice.Api.Token.AllocationV1:Allocation",
  status: "active",
  requestId: paymentRequest.requestId,
  settlementRefCid: paymentRequest.agreementCid,
  amount: "10.0",
  instrumentId: "Amulet",
  sender: health.roles.investor,
  receiver: health.roles.provider,
  settleBefore: paymentRequest.settleBefore,
};

const assetHolding = {
  kind: "assetHolding",
  contractId: "00assetholding1234567890abcdef1234",
  templateId: "pkg:Settlement.PrivateCreditToken:PrivateCreditHolding",
  status: "active",
  custodian: health.roles.provider,
  issuer: health.roles.provider,
  owner: health.roles.investor,
  instrumentId: offer.terms.assetId,
  amount: "1000.0",
};

const settlementReceipt = {
  kind: "settlementReceipt",
  contractId: "00receipt1234567890abcdef12345678",
  templateId: "pkg:Settlement.TokenizedPayment:TokenizedSettlementReceipt",
  status: "active",
  terms: offer.terms,
  eligibilityAttestationCid: attestation.contractId,
  requestId: paymentRequest.requestId,
  paymentAllocationCid: allocation.contractId,
  deliveryAllocationCid: deliveryAllocation.contractId,
  assetHoldingCids: [assetHolding.contractId],
  settledAt: "2026-08-21T20:30:00Z",
  balanceEvidence: {
    amount: "10.0",
    instrumentId: "Amulet",
    before: {
      investor: { unlocked: "90.0", locked: "10.0" },
      issuer: { unlocked: "50.0", locked: "0.0" },
    },
    after: {
      investor: { unlocked: "90.0", locked: "0.0" },
      issuer: { unlocked: "60.0", locked: "0.0" },
    },
    investorLockedReleased: "10",
    issuerReceived: "10",
    verified: true,
  },
};

async function mockApi(page) {
  await page.route("**/api/health", (route) => route.fulfill({ json: health }));
  await page.route("**/api/attestations", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({
      assetClass: "PRIVATE-CREDIT",
      validForHours: 3,
    });
    await route.fulfill({ status: 201, json: attestation });
  });
}

test("verifier creates an attestation and sees ledger evidence", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");

  await expect(page.getByText("LocalNet connected")).toBeVisible();
  await expect(page.getByRole("button", { name: "Issue attestation" })).toBeEnabled();
  await page.getByRole("button", { name: "Issue attestation" }).click();

  await expect(page.getByText("Eligibility active")).toBeVisible();
  await expect(page.getByText("Active attestation contract", { exact: true })).toBeVisible();
  await expect(page.locator("#contract-fields")).toContainText("PRIVATE-CREDIT");
  await expect(page.getByText("Created event present; no archive event.")).toBeVisible();
  await expect(page.getByText("1 of 6 complete")).toBeVisible();

  await page.getByRole("button", { name: "Investor" }).click();
  await expect(page.getByRole("heading", { name: "Review settlement eligibility" })).toBeVisible();
  await expect(page.getByText("No available action")).toBeVisible();
});

test("mobile layout does not overflow the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Private Credit Settlement" })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
});

test("discards a remembered contract after a LocalNet reset", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("regulated-settlement-attestation", "00stalecontract1234");
  });
  await page.route("**/api/health", (route) => route.fulfill({ json: health }));
  await page.route("**/api/attestations/*", (route) =>
    route.fulfill({
      status: 404,
      json: { code: "CONTRACT_NOT_FOUND", message: "Contract not found." },
    }),
  );

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Issue attestation" })).toBeEnabled();
  await expect(page.getByText("No contract selected")).toBeVisible();
});

test("roles complete the regulated settlement lifecycle", async ({ page }) => {
  await mockApi(page);
  await page.route("**/api/offers", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      attestationContractId: attestation.contractId,
      assetId: "PC-NOTE-2026-A",
      units: 1000,
      paymentAmount: "10.0",
      offerValidForMinutes: 30,
      settleInHours: 2,
    });
    await route.fulfill({ status: 201, json: offer });
  });
  await page.route("**/api/offers/*/accept", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      attestationContractId: attestation.contractId,
    });
    await route.fulfill({
      json: { offer: { ...offer, status: "archived" }, compliancePending },
    });
  });
  await page.route("**/api/compliance-pending/*/approve", async (route) => {
    expect(route.request().method()).toBe("POST");
    await route.fulfill({
      json: {
        compliancePending: { ...compliancePending, status: "archived" },
        purchaseAgreement,
      },
    });
  });
  await page.route("**/api/payment-proposals", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      agreementContractId: purchaseAgreement.contractId,
    });
    await route.fulfill({ status: 201, json: paymentProposal });
  });
  await page.route("**/api/payment-proposals/*/approve", async (route) => {
    await route.fulfill({
      json: {
        paymentProposal: { ...paymentProposal, status: "archived" },
        deliveryApproval,
      },
    });
  });
  await page.route("**/api/delivery-approvals/*/approve", async (route) => {
    expect(route.request().method()).toBe("POST");
    await route.fulfill({
      json: {
        deliveryApproval: { ...deliveryApproval, status: "archived" },
        approvedPayment,
        deliveryAllocation,
      },
    });
  });
  await page.route("**/api/approved-payments/*/accept", async (route) => {
    await route.fulfill({
      json: {
        approvedPayment: { ...approvedPayment, status: "archived" },
        paymentRequest,
      },
    });
  });
  await page.route("**/api/payment-requests/*/allocate", async (route) => {
    expect(route.request().method()).toBe("POST");
    await route.fulfill({ status: 201, json: allocation });
  });
  await page.route("**/api/payment-requests/*/complete", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      allocationContractId: allocation.contractId,
    });
    await route.fulfill({
      json: {
        paymentRequest: { ...paymentRequest, status: "archived" },
        purchaseAgreement: { ...purchaseAgreement, status: "archived" },
        allocation: { ...allocation, status: "archived" },
        deliveryAllocation: { ...deliveryAllocation, status: "archived" },
        assetHolding,
        settlementReceipt,
      },
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Issue attestation" }).click();
  await page.getByRole("button", { name: "Issuer" }).click();
  await expect(page.getByRole("button", { name: "Create asset offer" })).toBeEnabled();
  await page.getByRole("button", { name: "Create asset offer" }).click();
  await expect(page.getByText("Offer open")).toBeVisible();
  await expect(page.getByText("Active offer contract", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Investor" }).click();
  await expect(page.getByRole("button", { name: "Accept offer" })).toBeEnabled();
  await page.getByRole("button", { name: "Accept offer" }).click();
  await expect(page.getByText("Compliance pending")).toBeVisible();
  await expect(page.getByText("2 of 6 complete")).toBeVisible();
  await expect(page.getByText("Active compliance contract", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Offer" }).click();
  await expect(page.getByText("Archived offer contract", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Verifier" }).click();
  await expect(page.getByRole("button", { name: "Approve compliance" })).toBeEnabled();
  await page.getByRole("button", { name: "Approve compliance" }).click();
  await expect(page.getByText("Agreement active", { exact: true })).toBeVisible();
  await expect(page.getByText("3 of 6 complete")).toBeVisible();
  await expect(page.getByText("Active agreement contract", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Compliance" }).click();
  await expect(page.getByText("Archived compliance contract", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Issuer" }).click();
  await page.getByRole("button", { name: "Create payment proposal" }).click();
  await expect(page.getByText("Payment proposed")).toBeVisible();

  await page.getByRole("button", { name: "Verifier" }).click();
  await page.getByRole("button", { name: "Approve payment request" }).click();
  await expect(page.locator("#scenario-status")).toContainText("Custodian approval pending");

  await page.getByRole("button", { name: "Custodian" }).click();
  await expect(page.getByRole("button", { name: "Reserve private-credit units" })).toBeEnabled();
  await page.getByRole("button", { name: "Reserve private-credit units" }).click();
  await expect(page.getByText("Asset leg reserved", { exact: true })).toBeVisible();
  await expect(page.getByText("Active private-credit allocation contract", { exact: true })).toBeVisible();
  await expect(page.locator("#contract-fields")).toContainText("1000 PC-NOTE-2026-A");
  await expect(page.locator("#contract-fields")).toContainText("delivery");

  await page.getByRole("button", { name: "Investor" }).click();
  await page.getByRole("button", { name: "Accept payment request" }).click();
  await expect(page.getByText("Wallet request ready")).toBeVisible();
  await expect(page.getByText("Active payment request contract", { exact: true })).toBeVisible();
  await expect(page.locator("#contract-fields")).toContainText("Allocation request visible");

  await expect(page.getByRole("button", { name: "Allocate Canton Coin" })).toBeEnabled();
  await page.getByRole("button", { name: "Allocate Canton Coin" }).click();
  await expect(page.locator("#scenario-status")).toContainText("Both legs reserved");
  await expect(page.getByText("Active Canton Coin allocation contract", { exact: true })).toBeVisible();
  await expect(page.locator("#contract-fields")).toContainText("10 Amulet");
  await expect(page.locator("#contract-fields")).toContainText("payment");

  await page.getByRole("button", { name: "Issuer" }).click();
  await expect(page.getByRole("button", { name: "Execute atomic DvP" })).toBeEnabled();
  await page.getByRole("button", { name: "Execute atomic DvP" }).click();
  await expect(page.locator("#scenario-status")).toContainText("Atomic DvP complete");
  await expect(page.getByText("6 of 6 complete")).toBeVisible();
  await expect(page.getByText("Active DvP receipt contract", { exact: true })).toBeVisible();
  await expect(page.locator("#contract-fields")).toContainText("Exact transfer confirmed");
  await expect(page.locator("#contract-fields")).toContainText("50 -> 60 Amulet");
  await expect(page.locator("#contract-fields")).toContainText("Auditor");

  await page.getByRole("tab", { name: "Cash" }).click();
  await expect(page.getByText("Archived Canton Coin allocation contract", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Asset" }).click();
  await expect(page.getByText("Archived private-credit allocation contract", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Holding" }).click();
  await expect(page.getByText("Active private-credit holding contract", { exact: true })).toBeVisible();
  await expect(page.locator("#contract-fields")).toContainText("1000 units");
  await expect(page.locator("#contract-fields")).toContainText("Owner");
  await expect(page.locator("#contract-fields")).toContainText("app_user_quickstart");
  await page.getByRole("tab", { name: "Request" }).click();
  await expect(page.getByText("Archived payment request contract", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Receipt" }).click();
  await expect(page.locator("#contract-fields")).toContainText("Aug 21, 2026");
  await page.getByRole("button", { name: "Auditor" }).click();
  await expect(page.getByRole("heading", { name: "Settlement complete" })).toBeVisible();
});
