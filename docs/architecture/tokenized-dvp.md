# Tokenized DvP Architecture

Date: 2026-08-24

## Purpose

The integration model settles a private-credit primary issuance against Canton
Coin. Both sides are represented as Canton Token Standard allocations and both
`Allocation_ExecuteTransfer` choices run inside one Daml transaction.

```text
PurchaseAgreement
        |
issuer proposal -> verifier approval -> custodian asset reservation
        |
investor acceptance
        |
TokenizedPaymentRequest (implements AllocationRequest)
        +
Canton Coin Allocation + PrivateCreditAllocation
        |
        | CompleteTokenizedDvP
        v
TokenizedSettlementReceipt + investor PrivateCreditHolding
```

## Standard Request

`TokenizedPaymentRequest` exposes two named transfer legs through the standard
`AllocationRequest` interface:

| Leg | Sender | Receiver | Amount | Instrument admin |
| --- | --- | --- | --- | --- |
| `payment` | investor | issuer | settlement payment | Canton Coin registry |
| `delivery` | issuer | investor | note units | custodian |

Both legs share one `SettlementInfo`, including the issuer executor, request ID,
purchase-agreement contract ID, allocation deadline, and settlement deadline.
Stable leg IDs let each allocation identify exactly which obligation it funds.

## Private-Credit Token

`Settlement.PrivateCreditToken` supplies a focused Token Standard implementation
for the asset side:

- `PrivateCreditHolding` represents investor-owned or issuer-owned note units.
- `PrivateCreditLockedHolding` records units reserved for one settlement.
- `PrivateCreditAllocation` implements `Allocation` over that locked holding.
- `reservePrimaryIssuance` lets the custodian reserve issuer units and returns an
  interface-typed `ContractId Allocation`.

Executing the allocation archives the locked holding and creates a
`PrivateCreditHolding` for the investor. Cancel and withdraw restore a holding
to the sender. This is intentionally a primary-issuance model, not a general
fungible-token registry with splitting, merging, fees, or secondary transfers.

## Authority Accumulation

The workflow avoids an artificial cross-participant create command:

| State | New authority |
| --- | --- |
| `TokenizedPaymentProposal` | issuer signatory |
| `DeliveryApprovalPending` | verifier controls approval |
| `ApprovedTokenizedPayment` | custodian controls reservation |
| `TokenizedPaymentRequest` | investor controls acceptance |

Each consumed parent contributes its signatory authority to direct
consequences, and each choice controller contributes the next party. The final
request is signed by issuer, verifier, custodian, and investor.

Completion is controlled by issuer and verifier. The minimal LocalNet maps both
roles to app-provider. Independently hosted parties require interactive
multi-party submission or another staged approval.

## Atomic Transition

`CompleteTokenizedDvP`:

1. Fetches the active purchase agreement and eligibility attestation.
2. Rechecks request time, eligibility, terms, and settlement deadline.
3. Fetches both allocations through the standard `Allocation` interface.
4. Compares each leg ID, complete `TransferLeg`, and complete `SettlementInfo`.
5. Executes the Canton Coin allocation with registry context and disclosures.
6. Executes the private-credit allocation.
7. Archives the purchase agreement.
8. Creates `TokenizedSettlementReceipt` with both allocation IDs and the
   investor holding IDs returned by the delivery transfer.

Daml commits this as one transaction. The test
`testBrokenDeliveryRollsBackPayment` deliberately lets the payment child choice
execute and then fails the delivery child choice. It proves that the payment
allocation remains active and no payment transfer receipt survives.

## Test And Runtime Boundaries

The Daml test package uses `MockAllocation` for the payment leg so mismatch,
expiry, inactive-contract, authorization, and rollback cases remain fast and
deterministic. The delivery leg uses the production private-credit allocation.

The LocalNet runner replaces only the payment mock with a real wallet-funded
Canton Coin allocation. It obtains execute-transfer context and disclosed
contracts from the Canton Coin registry; the private-credit allocation needs no
off-ledger context. The full two-leg runner is implemented but has not yet been
rerun in the current shell because Docker Desktop WSL integration is disabled.
