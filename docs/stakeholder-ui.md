# Stakeholder UI

The `app/` directory is the V3 stakeholder slice. It connects a role-based
browser interface to the real Quickstart LocalNet JSON Ledger APIs.

## Current Slice

The current workflow supports:

1. Verifier creates `EligibilityAttestation` as the LocalNet provider party.
2. Issuer creates `AssetOffer` with units, payment, and deadlines.
3. Investor exercises `AcceptOffer` through the app-user participant.
4. Verifier exercises `ApproveCompliance` through the provider participant.
5. The timeline advances to `PurchaseAgreement`.
6. Issuer proposes payment, verifier approves it, and investor accepts it.
7. The standard wallet discovers the resulting `TokenizedPaymentRequest`.
8. Investor allocates the exact payment leg through the standard wallet API.
9. The inspector shows the active attestation, agreement, payment request, and
   real Canton Coin allocation alongside archived authorization states from
   fresh Ledger API queries.

Custodian and auditor views remain read-only until their corresponding ledger
transitions are implemented.

## Boundary

The browser calls only the local backend:

- `GET /api/health`
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
- `GET /api/approved-payments/:contractId`
- `POST /api/approved-payments/:contractId/accept`
- `GET /api/payment-requests/:contractId`
- `POST /api/payment-requests/:contractId/allocate`
- `GET /api/allocations/:contractId`

The backend retrieves participant context from the Quickstart onboarding
container. Issuer and verifier commands use the provider Ledger API on
`127.0.0.1:3975`; offer acceptance uses the investor Ledger API on
`127.0.0.1:2975`. Participant tokens are never returned to the browser. This is
an appropriate LocalNet demo boundary, not a production identity design.

## Run

Build the Daml packages and start Quickstart as described in `docs/runbook.md`.
Upload the model DAR by running the LocalNet demo runner at least once, then:

```bash
npm install
npm run app
```

Open `http://127.0.0.1:4173` and follow the Verifier, Issuer, and Investor
actions shown for the current state.

## Tests

```bash
npm run test:app
npm run test:ui
```

The Node suite verifies input validation, provider/investor command authority,
JSON encoding, and created/archived event normalization. Playwright verifies
the role interactions, state progression, contract tabs, and desktop/mobile
layout.

## Next Extension

Execute the allocated Canton Coin as the next stateful milestone:

1. Backend obtains the registry execute-transfer context and disclosures.
2. Provider exercises `CompleteTokenizedPayment` atomically with allocation
   execution.
3. The UI verifies the request, agreement, and allocation were consumed and
   shows the resulting `PaymentPrepared` contract.

Continue this pattern for each transition. Every visible state change must come
from a transaction response or a fresh contract query; the frontend must not
advance the timeline optimistically.
