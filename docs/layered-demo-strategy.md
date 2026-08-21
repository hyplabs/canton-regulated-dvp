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

Status: the real Canton Coin payment path is complete on LocalNet; the delivery
leg remains.

1. Completed: pin token-standard API DAR data dependencies.
2. Completed: expose the payment leg through `AllocationRequest`.
3. Completed: validate and execute one matching `Allocation` atomically with
   advancement to `PaymentPrepared`.
4. Completed: execute a Quickstart/LocalNet Canton Coin allocation and verify
   both wallet balances.
5. Next: model and execute the tokenized delivery leg in the same transaction.
6. Completed: add a repeatable JSON Ledger API runner.
7. Then: add a thin backend adapter for the presentation UI.

The official Quickstart licensing workflow is the primary implementation
reference because it validates an allocation and executes its transfer inside a
business-state transition.

## V3: Stakeholder Demo

Goal: explain the workflow in three to five minutes without weakening the proof.

Status: the first three ledger states are connected. The browser creates an
eligibility attestation and asset offer, then accepts the offer through the
investor participant to reach compliance review.

- Completed: role switcher for issuer, investor, verifier, custodian, and auditor.
- In progress: timeline reflecting the exact on-ledger state through
  `CompliancePending`.
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
