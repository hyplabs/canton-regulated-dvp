# Stakeholder UI

The `app/` directory is the V3 stakeholder slice. It connects a role-based
browser interface to the real Quickstart LocalNet JSON Ledger APIs.

## Current Slice

The current workflow supports:

1. Verifier creates `EligibilityAttestation` as the LocalNet provider party.
2. Issuer creates `AssetOffer` with units, payment, and deadlines.
3. Investor exercises `AcceptOffer` through the app-user participant.
4. The timeline advances to `CompliancePending`.
5. The inspector shows the active attestation, archived offer, and active
   compliance contract from fresh Ledger API queries.

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

Add verifier compliance approval as the next stateful action:

1. Verifier exercises `ApproveCompliance` on the active `CompliancePending`.
2. Canton archives the pending contract and creates `PurchaseAgreement`.
3. The timeline marks Compliance complete and Payment current.
4. The inspector retains both the archived review and active agreement.

Continue this pattern for each transition. Every visible state change must come
from a transaction response or a fresh contract query; the frontend must not
advance the timeline optimistically.
