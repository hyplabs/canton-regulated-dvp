# Layered Demo Strategy

Date: 2026-08-20

## V1: Contract Truth

Status: complete and tested.

V1 proves the business workflow in Daml:

- Active eligibility at acceptance and settlement.
- Explicit verifier approval for the specific agreement.
- Single-use agreement, payment, delivery, and settlement states.
- Settlement deadlines and expiry cleanup.
- Direct-construction resistance through accumulated signatories.
- Scoped visibility and final auditor disclosure.
- Thirteen passing Daml scripts.

The fallback technical demo is:

```bash
./scripts/test.sh
```

## V2: Canton Runtime And Token Standard

Goal: turn the V1 settlement evidence into actual Canton integration.

1. Add token-standard DAR data dependencies.
2. Model payment and asset transfer legs with allocation requests.
3. Use a shared settlement reference and `settleBefore` deadline.
4. Execute both allocations atomically during finalization.
5. Run the packages in Canton Quickstart/LocalNet.
6. Add JSON Ledger API examples or a thin backend adapter.

The official Quickstart licensing workflow is the primary implementation
reference because it validates an allocation and executes its transfer inside a
business-state transition.

## V3: Stakeholder Demo

Goal: explain the workflow in three to five minutes without weakening the proof.

- Role switcher for issuer, investor, verifier, custodian, and auditor.
- Timeline reflecting the exact on-ledger state.
- Commands enabled only for the current role and active contract.
- Visible failure for withdrawn or expired eligibility.
- Auditor view limited to the final receipt.

The presented V3 should call V1/V2 through a backend or Ledger API. A disconnected
in-memory mock may be useful for wireframing, but it should not be represented as
the working Canton demo.

## Presentation Order

1. Show the role-based workflow and successful settlement.
2. Repeat with eligibility withdrawn before finalization.
3. Open the Daml finalization choice and its negative test.
4. Show the token-standard allocation mapping and LocalNet runtime.
