# Tokenized Payment Architecture

Date: 2026-08-21

## Purpose

This V2 slice replaces V1's manually supplied payment reference with execution
of a Canton Token Standard allocation. It deliberately reuses the V1 states
after payment so the integration is narrow and reviewable.

```text
PurchaseAgreement
        +
TokenizedPaymentRequest (implements AllocationRequest)
        +
funded Allocation (implemented by a token registry)
        |
        | CompleteTokenizedPayment
        v
PaymentPrepared -> ReadyToSettle -> SettlementReceipt
```

## Standard Boundary

`TokenizedPaymentRequest` exposes one transfer leg through the standard
`AllocationRequest` interface:

| Field | Value |
| --- | --- |
| sender | investor |
| receiver | issuer |
| amount | settlement payment amount |
| instrument | configured `InstrumentId` |
| executor | issuer |
| settlement reference | payment request ID + purchase agreement contract ID |

The app does not depend on a concrete token template. It accepts
`ContractId Allocation`, fetches its interface view, and requires the transfer
leg ID, transfer data, and complete `SettlementInfo` to equal its request. It
then exercises `Allocation_ExecuteTransfer`.

## Atomic Transition

`CompleteTokenizedPayment` performs one transaction that:

1. Re-fetches the active purchase agreement and eligibility attestation.
2. Checks request time, settlement deadline, terms, attestation, and allocation.
3. Executes the allocation's standard transfer choice.
4. Archives the purchase agreement.
5. Creates `PaymentPrepared` with the settlement reference as `paymentRef`.

If any check or child exercise fails, Daml rejects the whole transaction. The
allocation, request, and agreement remain active and no next state is created.

## Authorization

The request signatories are issuer, investor, and verifier. Completion is
controlled jointly by issuer and verifier. The request therefore records the
investor's advance authorization while retaining the V1 compliance gate; its
direct child allocation exercise has the sender, receiver, and executor
authority required by the standard.

The instrument's wallet or registry remains responsible for creating a funded
allocation before `allocateBefore`. The application executor may execute it
only before `settleBefore`.

## Test Boundary

`MockAllocation` is a test-only implementation of the real `Allocation`
interface. It records an execution receipt but does not model balances or a
specific token registry. This proves interface compatibility, exact matching,
authorization, and transaction atomicity without pretending that mock funds are
real tokens.

The next runtime milestone is to replace `MockAllocation` with an allocation
from a Quickstart/LocalNet registry. Full DvP then requires a second standard
allocation for delivery, both executed in the same settlement transaction.
