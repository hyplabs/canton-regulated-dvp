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

Status: the two-leg Daml model, LocalNet driver, backend, and UI are complete.
The post-change Quickstart rehearsal remains pending.

1. Completed: pin token-standard API DAR data dependencies.
2. Completed: expose payment and delivery legs through `AllocationRequest`.
3. Completed: validate and execute a real Canton Coin `Allocation` through the
   standard interface.
4. Completed: execute a Quickstart/LocalNet Canton Coin allocation and verify
   both wallet balances.
5. Completed: implement private-credit `Holding` and `Allocation` contracts and
   execute delivery with payment in `CompleteTokenizedDvP`.
6. Completed: add a repeatable JSON Ledger API runner.
7. Completed: connect both allocations, the resulting investor holding, and DvP
   receipt to the presentation UI.
8. Next: rerun and rehearse the two-leg driver on Quickstart.

The official Quickstart licensing workflow is the primary implementation
reference because it validates an allocation and executes its transfer inside a
business-state transition.

## V3: Stakeholder Demo

Goal: explain the workflow in three to five minutes without weakening the proof.

Status: complete through `TokenizedSettlementReceipt`. The browser
creates an eligibility attestation and asset offer, then accepts the offer
through the investor participant and approves compliance through the verifier
to reach the purchase agreement. Issuer, verifier, and investor authorize a
standard two-leg request, the custodian reserves the private-credit units, the
investor wallet reserves real Canton Coin, and the issuer executes both
allocations atomically. The receipt links the consumed allocations to the
investor's new asset holding.

- Completed: role switcher for issuer, investor, verifier, custodian, and auditor.
- Completed: timeline reflecting the exact on-ledger state through all six
  workflow stages and retaining archived intermediate contracts.
- Completed: commands enabled only for the current role and active contract.
- Completed: Auditor role focuses the completed receipt.
- Next: visible wrong-party or expired-eligibility failure controls.

The presented V3 should call V1/V2 through a backend or Ledger API. A disconnected
in-memory mock may be useful for wireframing, but it should not be represented as
the working Canton demo.

## Presentation Order

1. Show the role-based workflow and successful settlement.
2. Show the wrong-party rejection and unchanged allocation state.
3. Open `CompleteTokenizedDvP` and the delivery-failure rollback test.
4. Show the token-standard allocation mapping and LocalNet runtime.
