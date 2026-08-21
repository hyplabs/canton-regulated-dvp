# Stakeholder UI

The `app/` directory is the first V3 vertical slice. It connects a role-based
browser interface to the real Quickstart LocalNet JSON Ledger API.

## Current Slice

The verifier can:

1. Select an asset class and attestation lifetime.
2. Create an `EligibilityAttestation` as the LocalNet provider party.
3. See the eligibility stage advance from pending to active.
4. Refresh the contract by ID and confirm that Canton reports a created event
   with no archive event.

Issuer, investor, custodian, and auditor views are present but remain read-only
until their corresponding ledger transitions are implemented.

## Boundary

The browser calls only the local backend:

- `GET /api/health`
- `POST /api/attestations`
- `GET /api/attestations/:contractId`

The backend retrieves participant context from the Quickstart onboarding
container and calls the provider Ledger API on `127.0.0.1:3975`. Participant
tokens are never returned to the browser. This is an appropriate LocalNet demo
boundary, not a production identity design.

## Run

Build the Daml packages and start Quickstart as described in `docs/runbook.md`.
Upload the model DAR by running the LocalNet demo runner at least once, then:

```bash
npm install
npm run app
```

Open `http://127.0.0.1:4173` and use the Verifier role.

## Tests

```bash
npm run test:app
npm run test:ui
```

The Node suite verifies input validation, command authority, JSON encoding, and
created/archived event normalization. Playwright verifies the role interaction,
active contract evidence, and desktop/mobile layout.

## Next Extension

Add `AssetOffer` as the next stateful action:

1. The issuer creates an offer referencing the current scenario terms.
2. The UI stores the returned contract ID in scenario state.
3. The timeline marks Eligibility and Offer active.
4. The investor view exposes `AcceptOffer` only while both contracts are active.

Continue this pattern for each transition. Every visible state change must come
from a transaction response or a fresh contract query; the frontend must not
advance the timeline optimistically.
