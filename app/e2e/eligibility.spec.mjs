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
  contractId: "00abcdef1234567890abcdef1234567890",
  templateId: "pkg:Settlement.Regulated:EligibilityAttestation",
  status: "active",
  verifier: health.roles.provider,
  investor: health.roles.investor,
  assetClass: "PRIVATE-CREDIT",
  expiresAt: "2026-08-22T00:00:00Z",
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
  await expect(page.getByText("Active contract", { exact: true })).toBeVisible();
  await expect(page.locator("#detail-asset-class")).toHaveText("PRIVATE-CREDIT");
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
  await expect(page.getByText("No attestation selected")).toBeVisible();
});
