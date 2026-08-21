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
6. The inspector shows the active attestation and agreement alongside the
   archived offer and compliance review from fresh Ledger API queries.

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

Add tokenized payment authorization as the next stateful milestone:

1. Issuer creates `TokenizedPaymentProposal` for the agreement.
2. Verifier exercises `ApproveTokenizedPayment`.
3. Investor exercises `AcceptTokenizedPayment` through the app-user participant.
4. The standard wallet discovers the resulting `TokenizedPaymentRequest`.

Continue this pattern for each transition. Every visible state change must come
from a transaction response or a fresh contract query; the frontend must not
advance the timeline optimistically.
