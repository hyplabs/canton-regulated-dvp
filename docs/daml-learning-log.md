# Daml Learning Guide For This POC

This guide teaches Daml through the code in
`daml/model/daml/Settlement/Regulated.daml` and the executable examples in
`daml/tests/daml/Settlement/RegulatedTest.daml`.

## 1. Start With Parties And Authority

Daml models multi-party rights and obligations. Before thinking about storage,
ask:

- Who must authorize this state?
- Who may see it?
- Who may move it forward?

Those questions map to `signatory`, `observer`, and `controller`.

```daml
template AssetOffer
  with
    terms : SettlementTerms
    offerExpiresAt : Time
    settleBefore : Time
  where
    signatory terms.issuer
    observer terms.investor
```

The issuer authorizes the offer. The intended investor sees it. The custodian
and auditor do not.

## 2. Records Hold Repeated Business Data

`SettlementTerms` is a Daml record shared by each lifecycle state:

```daml
data SettlementTerms = SettlementTerms
  with
    issuer : Party
    investor : Party
    verifier : Party
    custodian : Party
    auditor : Party
    assetId : Text
    assetClass : Text
    units : Int
    paymentAmount : Decimal
    paymentInstrumentId : Text
```

Record-dot syntax reads fields such as `terms.issuer`. A pure helper validates
the shared data:

```daml
validSettlementTerms : SettlementTerms -> Bool
```

## 3. Templates Are Live Contract Types

A template combines data with authorization and lifecycle rules. Created
contracts are active until a consuming choice archives them.

`ensure` validates every direct creation:

```daml
ensure validSettlementTerms terms && offerExpiresAt < settleBefore
```

This matters because templates do not have private constructors. The signatories
can directly create a template, so important invariants and signatory sets must
be correct on every state, not only inside UI code.

## 4. Choices Are Authorized State Transitions

```daml
choice PreparePayment : ContractId PaymentPrepared
  with
    paymentRef : Text
  controller terms.investor
```

The investor controls this action. It returns the contract ID of the next state.
Choices are consuming by default, so the agreement is archived automatically.
There is no explicit `archive self`; attempting the choice again fails because
the old contract is no longer active.

That is how V1 prevents duplicate payment preparation:

```text
PurchaseAgreement -> PaymentPrepared
```

## 5. Contract IDs And `fetch`

`ContractId T` is a typed reference to a contract of template `T`.

Each settlement state carries:

```daml
eligibilityAttestationCid : ContractId EligibilityAttestation
```

Finalization calls `fetch eligibilityAttestationCid`. Fetch succeeds only if the
contract is active and visible to a reading party. A withdrawn attestation is
archived, so the transaction fails before a receipt can be created.

## 6. Time Is Ledger State

Choices read ledger time with `getTime` and compare it with `Time` fields:

```daml
now <- getTime
require "Settlement deadline has not passed" (now < settleBefore)
```

Tests use `passTime` to prove expiration behavior without waiting in real time.

## 7. Authorization Accumulates Through Direct Consequences

The verifier approval state exists for an important reason. Exercising a choice
on one contract does not magically combine all authority from a separately
nested exercise.

The tested pattern is:

```text
CompliancePending signatories: issuer + investor
ApproveCompliance controller: verifier
PurchaseAgreement signatories: issuer + investor + verifier
```

The parent contract contributes issuer and investor authority; the controller
contributes verifier authority. The created agreement therefore has all required
signatories.

Later, `ConfirmDelivery` adds the custodian in the same way.

## 8. Multi-Party Submission

Final settlement requires both issuer and verifier controllers:

```daml
controller terms.issuer, terms.verifier
```

The script submits with both act-as parties:

```daml
submit (actAs [issuer, verifier]) do
  exerciseCmd readyCid FinalizeSettlement
```

This lets the verifier read and revalidate its private attestation while the
issuer authorizes settlement.

## 9. Daml Script As Executable Documentation

The test package imports the model DAR as a data dependency. `submit` expects a
transaction to succeed; `submitMustFail` expects it to fail.

Negative tests also query the original state after rejection. That proves the
failed transaction was atomic and did not accidentally consume the workflow.

Useful examples:

- `testRegulatedSettlementHappyPath`
- `testWithdrawnAttestationBlocksSettlement`
- `testPaymentCanOnlyBePreparedOnce`
- `testIssuerAndInvestorCannotBypassVerifier`
- `testOfferVisibilityIsScoped`

## 10. What V2 Will Teach

The next Daml concepts should come from token-standard integration:

- Interfaces and interface contract IDs.
- Data dependencies on token-standard DARs.
- Allocation requests and transfer legs.
- Settlement references and allocation deadlines.
- Atomic execution of payment and delivery transfers.

The official sibling reference is
`../resources/cn-quickstart/quickstart/daml/licensing` from the repository root.
