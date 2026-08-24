# Stakeholder UI

The `app/` directory is the V3 presentation slice. Its role-based browser calls
a local backend that translates actions to Quickstart JSON Ledger, wallet, and
registry APIs. The browser never receives participant or wallet credentials.

## Presented Flow

1. Verifier creates `EligibilityAttestation`.
2. Issuer creates `AssetOffer`.
3. Investor accepts, producing `CompliancePending`.
4. Verifier approves compliance, producing `PurchaseAgreement`.
5. Issuer proposes the two-leg settlement.
6. Verifier checks both transfer legs and creates `DeliveryApprovalPending`.
7. Custodian reserves note units in `PrivateCreditAllocation`.
8. Investor accepts the authorized request.
9. The standard wallet discovers `TokenizedPaymentRequest` and reserves Canton
   Coin in a standard allocation.
10. Issuer executes `CompleteTokenizedDvP` with Canton Coin registry context.
11. Canton consumes the cash allocation, asset allocation, request, and
    agreement atomically; it creates the investor holding and DvP receipt.
12. Auditor inspects the final receipt and its allocation/holding references.

The inspector keeps created and archived contracts in separate tabs. Cash and
Asset show the two consumed allocations, Holding shows investor ownership, and
Receipt shows the settlement reference, both allocation IDs, final holding ID,
eligibility evidence, timestamp, and supporting wallet balance snapshots.

## Backend Boundary

The current DvP routes are:

- `POST /api/attestations`
- `GET /api/attestations/:contractId`
- `POST /api/offers`
- `GET /api/offers/:contractId`
- `POST /api/offers/:contractId/accept`
- `GET /api/compliance-pending/:contractId`
- `POST /api/compliance-pending/:contractId/approve`
- `GET /api/agreements/:contractId`
- `POST /api/payment-proposals`
- `GET /api/payment-proposals/:contractId`
- `POST /api/payment-proposals/:contractId/approve`
- `GET /api/delivery-approvals/:contractId`
- `POST /api/delivery-approvals/:contractId/approve`
- `GET /api/approved-payments/:contractId`
- `POST /api/approved-payments/:contractId/accept`
- `GET /api/payment-requests/:contractId`
- `POST /api/payment-requests/:contractId/allocate`
- `POST /api/payment-requests/:contractId/complete`
- `GET /api/allocations/:contractId`
- `GET /api/delivery-allocations/:contractId`
- `GET /api/asset-holdings/:contractId`
- `GET /api/receipts/:contractId`

V1 prepared-payment routes remain in the backend for compatibility and learning
tests, but the browser does not use them.

Issuer, verifier, custodian, and auditor commands use the provider Ledger API on
`127.0.0.1:3975`. Investor commands use the app-user Ledger API on
`127.0.0.1:2975`. The wallet operation uses the investor validator, and DvP
completion gets Canton Coin choice context inside the onboarding container.
This is an appropriate LocalNet demo boundary, not a production identity
design.

## Run And Test

Build the DARs and start Quickstart as described in the
[local runbook](../demo/runbook.md), then:

```bash
npm install
npm run app
```

Open `http://127.0.0.1:4173` and follow the enabled action for each role.

```bash
npm run test:app
npm run test:ui
```

The Node suite verifies command authority, standard allocation mapping, registry
context, atomic result evidence, and legacy V1 compatibility. Playwright covers
the complete DvP role flow, contract tabs, LocalNet reset handling, and mobile
overflow.

## Next Extensions

- Add visible negative-path controls for withdrawn or expired eligibility.
- Preserve optional wallet balance snapshots across a backend restart without
  treating them as ledger state.
- Replace shared-secret LocalNet identities with a production-ready identity and
  authorization design.
- Add a secondary-transfer path for already issued private-credit holdings.

Every visible state change must continue to come from a transaction response or
a fresh contract query. The frontend must not advance optimistically.
