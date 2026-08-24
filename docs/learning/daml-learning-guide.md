# Daml Learning Guide For This POC

This guide teaches Daml through the retained V1 workflow and the completed DvP
integration:

- `daml/model/daml/Settlement/Regulated.daml`
- `daml/tokenized-model/daml/Settlement/TokenizedPayment.daml`
- `daml/tokenized-model/daml/Settlement/PrivateCreditToken.daml`
- both executable Daml Script test suites

Sections 1-9 explain the deliberately simple V1 state machine. Later sections
show how that model evolves into two Token Standard allocation legs without
erasing the earlier learning steps.

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

## 10. DAR Data Dependencies

The V2 model is a separate Daml package. Its `daml.yaml` imports both our V1
model DAR and four Canton Token Standard API DARs:

```yaml
data-dependencies:
  - ../model/.daml/dist/canton-regulated-settlement-model-0.1.0.dar
  - ../vendor/splice-api-token-allocation-v1-1.0.0.dar
  - ../vendor/splice-api-token-allocation-request-v1-1.0.0.dar
```

A source dependency lets the compiler build another package's source. A data
dependency instead says, "compile against the public Daml-LF API in this DAR."
That is how an app can integrate with a published standard without owning or
copying its source modules.

The vendored API DARs are pinned binary inputs, not production token contracts.
They define types and interfaces; a registry supplies templates that implement
those interfaces at runtime.

## 11. Interfaces Describe Shared Behavior

A Daml template is one concrete contract type. An interface describes behavior
that many unrelated templates can implement. Our app template declares:

```daml
interface instance AllocationRequest for TokenizedPaymentRequest where
  view = tokenizedPaymentRequestView this
```

This means a standard wallet can discover our app-specific request as an
`AllocationRequest`, even though it knows nothing about
`TokenizedPaymentRequest` itself.

The interface view is the common data projection exposed to that wallet:

```daml
AllocationRequestView with
  settlement = SettlementInfo with ...
  transferLegs = TextMap.fromList
    [ (paymentLegId, paymentLeg)
    , (deliveryLegId, deliveryLeg)
    ]
  meta
```

Our request has two legs: the investor sends payment to the issuer, and the
issuer sends note units to the investor. `TextMap` gives each leg a stable
textual ID so independently created allocations can identify which obligation
they fund while sharing one settlement reference.

## 12. Interface Contract IDs

The completion choice stores or accepts two values of this type:

```daml
allocationCid : ContractId Allocation
```

That is an interface contract ID, not the ID of one concrete token template.
The private-credit allocation ID is stored in the request; the Canton Coin
allocation ID arrives when the wallet has funded it. Any active contract
implementing `Allocation` can fill either slot. The model reads each through the
interface:

```daml
allocation <- fetch @Allocation allocationCid
let allocationView = view @Allocation allocation
```

Tests create a concrete payment `MockAllocation` and convert its ID with
`toInterfaceContractId`. The production custodian helper returns the asset
allocation in the same interface form. LocalNet passes a real Canton Coin
registry allocation through the payment argument.

## 13. Never Trust A Contract ID By Type Alone

The interface type proves that the contract supports allocation behavior. It
does not prove that it funds this purchase. For each leg, the model compares:

- `transferLegId` against the expected `payment` or `delivery` leg ID.
- The complete `TransferLeg`, including sender, receiver, amount, and instrument.
- The complete `SettlementInfo`, including request ID, agreement contract ID,
  and both deadlines.

Only after all three match does it execute:

```daml
_ <- exercise allocationCid (Allocation_ExecuteTransfer extraArgs)
```

`testMismatchedPaymentCannotSettle` changes the amount by one unit.
The interface type is still correct, but the business identity is wrong, so the
transaction fails.

## 14. One Transaction Composes Multiple Contracts

`CompleteTokenizedDvP` is `postconsuming`. On success it consumes the
request after its body has:

1. Fetched and checked the agreement and eligibility attestation.
2. Validated both allocation views.
3. Exercised the payment allocation.
4. Exercised the delivery allocation.
5. Archived the V1 `PurchaseAgreement`.
6. Created `TokenizedSettlementReceipt` with the delivery result's holding IDs.

Daml transactions are atomic. If allocation execution or any validation fails,
none of those effects commit. The strongest test lets the payment child choice
run and then deliberately fails delivery. It queries both allocations,
agreement, and request afterward and proves they remain active. It also proves
that no mock payment receipt survived.

This is stronger than application code that performs a transfer and then makes
a second API call to update workflow state. There is no committed intermediate
state where only one side happened.

## 15. Authority Can Be Granted In Advance

The tokenized request is signed by issuer, investor, verifier, and custodian.
Its completion choice is controlled by issuer and verifier:

```daml
signatory terms.issuer, terms.investor, terms.verifier, terms.custodian
controller terms.issuer, terms.verifier
```

The investor authorizes the request on acceptance; the custodian authorized the
locked asset allocation in the preceding state. Parent authority is available
to both direct child allocation exercises, whose standard controllers include
sender, receiver, and executor. The verifier remains a required controller for
the app-level compliance gate.

The wrong-party test submits as the investor alone. It fails because prior
authorization does not let the investor impersonate the issuer and verifier who
control completion.

## 16. Test Implementations Versus Real Registries

`MockAllocation` is deliberately small: it implements the real standard
interface for the payment leg, consumes itself on execution, and creates a test
receipt. It does not track balances, lock holdings, calculate fees, or represent
a production token.

The asset leg uses the production `PrivateCreditAllocation`, including its
locked holding and resulting investor holding. This lets one test transaction
compose two unrelated implementations of the same interface. The earlier
payment-only LocalNet runner proved real wallet and registry execution; the
updated two-leg runner still needs its post-change Quickstart rehearsal.

The official comparison implementation is
the official
[`cn-quickstart/daml/licensing`](https://github.com/digital-asset/cn-quickstart/tree/main/quickstart/daml/licensing)
example, with fuller DvP examples in the upstream Token Standard test sources.

## 17. Small Language Notes From This Slice

- `@Allocation` is visible type application: it tells polymorphic functions
  such as `fetch` and `view` which interface type to use.
- `fromSome` unwraps the expected transfer leg from `TextMap.lookup`. It is safe
  here because the same pure view function always inserts that key.
- `this` is the current template value inside a choice or interface instance.
- `with` performs record construction and record update.
- `agreement` is reserved template syntax in Daml, so the local fetched value is
  named `purchaseAgreement`.

## 18. Multi-Party Tests Are Not Multi-Participant Workflows

An early test fixture created `TokenizedPaymentRequest` with one script command:

```daml
submit (actAs [issuer, investor, verifier, custodian]) do
  createCmd TokenizedPaymentRequest with ...
```

That is valid when one participant and user can act for every party. In the
Quickstart topology, the issuer and investor are hosted by different
participants, so neither participant may claim both parties in one command.

The production model accumulates authority over four ordinary actions:

```text
TokenizedPaymentProposal             signatory issuer
  -> ApproveTokenizedPayment          controller verifier
DeliveryApprovalPending              signatories issuer + verifier
  -> ApprovePrivateCreditDelivery     controller custodian
ApprovedTokenizedPayment             signatories issuer + verifier + custodian
  -> AcceptTokenizedPayment           controller investor
TokenizedPaymentRequest              issuer + verifier + custodian + investor
```

The signatories of each consumed parent authorize its direct consequences, and
the current choice controller contributes the next party's authority. This is
the same language rule used by the V1 compliance workflow, now applied across
real participant boundaries.

## 19. Daml Values On The JSON Ledger API

Daml's JSON encoding is typed even though JSON itself is not. Two details from
the LocalNet runner are easy to miss:

- Daml `Int64` and `Decimal` values are JSON strings such as `"1000"` and
  `"10.0"`, avoiding JavaScript precision loss.
- Daml `Time` fields in contract arguments use ISO-8601 text, while the wallet's
  off-ledger allocation API represents deadlines as integer microseconds since
  the Unix epoch.

The runner deliberately constructs JSON with `jq` rather than concatenating
contract payload strings. A malformed numeric representation is rejected before
Daml interpretation.

## 20. Off-Ledger Context Enables On-Ledger Atomicity

Executing Canton Coin requires current registry contracts such as
`AmuletRules`, `OpenMiningRound`, and the locked holding. The registry's
execute-transfer context endpoint returns:

- `choiceContextData`, encoded as Token Standard `AnyValue` entries.
- `disclosedContracts`, including opaque event blobs needed by the participant.

`scripts/localnet-demo.sh` places the first value in `ExtraArgs.context` and the
second in the Ledger API command envelope. Daml can then exercise the real
payment allocation as a child of `CompleteTokenizedDvP`. The private-credit
allocation is the second child exercise and needs only empty standard context.
Both transfers, agreement archive, request consumption, investor holding, and
DvP receipt either all commit or all fail.

## 21. A Browser Action Is Still A Daml Command

The first stakeholder UI action creates `EligibilityAttestation`; it does not
write application state to a separate database. The backend translates the form
into this JSON Ledger API command:

```json
{
  "CreateCommand": {
    "templateId": "#canton-regulated-settlement-model:Settlement.Regulated:EligibilityAttestation",
    "createArguments": {
      "verifier": "<provider party>",
      "investor": "<investor party>",
      "assetClass": "PRIVATE-CREDIT",
      "expiresAt": "<ISO-8601 time>"
    }
  }
}
```

The command envelope sets `actAs` to the verifier. That matches the template's
`signatory verifier`, so Canton accepts the creation only with verifier
authority. The investor becomes an observer because the Daml template declares
`observer investor`; the browser does not decide contract visibility.

After submission, the backend calls `events-by-contract-id`. An active result
has a created event and no archive event. The UI timeline and inspector are
therefore projections of ledger state, not a second workflow implementation.

## 22. Parent Authority Flows Into A Choice Result

The issuer creates `AssetOffer`, so the offer contract has issuer authority as
its signatory. The investor later submits only this exercise:

```daml
exercise offerCid AcceptOffer with
  eligibilityAttestationCid
```

`AcceptOffer` is controlled by the investor, but its result creates
`CompliancePending`, whose signatories are both issuer and investor. This works
without pretending that the investor participant can act as the issuer. The
consumed `AssetOffer` supplies its issuer signatory authority to direct
consequences of the choice, while the controller contributes investor
authority.

That is why the browser backend sends offer creation to the provider Ledger API
and acceptance to the app-user Ledger API. After acceptance, a fresh query shows
the offer archived and `CompliancePending` active. The two visible changes are
parts of one atomic Daml transaction.

## 23. Approval Accumulates A Third Party's Authority

`CompliancePending` already has issuer and investor as signatories. Its
`ApproveCompliance` choice is controlled by the verifier:

```daml
choice ApproveCompliance : ContractId PurchaseAgreement
  controller terms.verifier
```

The resulting `PurchaseAgreement` names issuer, investor, and verifier as
signatories. As with offer acceptance, the parent contract supplies existing
signatory authority and the choice controller contributes the additional
party. The provider participant can submit the choice because it hosts the
verifier in minimal LocalNet.

The UI does not relabel `CompliancePending` as approved in memory. It re-queries
that contract to confirm its archive event and independently queries the new
agreement's created event. This keeps the visual timeline subordinate to Daml's
actual transaction result.

## 24. Standard Interfaces Decouple The Wallet From Our Template

Settlement authorization accumulates authority in four contracts:

```text
TokenizedPaymentProposal       issuer signatory
DeliveryApprovalPending        issuer + verifier signatories
ApprovedTokenizedPayment       issuer + verifier + custodian signatories
TokenizedPaymentRequest        issuer + verifier + custodian + investor
```

The provider submits the issuer proposal, verifier approval, and custodian
reservation in minimal LocalNet; the app-user participant submits investor
acceptance. Each transition reuses the parent-authority rule from the regulated
workflow.

The final template implements `AllocationRequest`, so the wallet discovers it
through the standard view rather than by importing or parsing
`TokenizedPaymentRequest`. The UI checks the wallet API separately after the
ledger transaction. A delayed wallet response does not undo or hide the already
committed Daml contract; refresh can confirm discovery later.

## 25. The Wallet Creates A Standard Contract, Not App State

The investor's Allocate action does not exercise a choice on our template. The
backend reads the `AllocationRequest` standard view and sends its settlement and
payment leg to the wallet's `/v0/allocations` API. The wallet is responsible for
selecting and locking funded Canton Coin holdings.

The two APIs use different representations of the same deadlines. The Daml JSON
view contains ISO-8601 timestamps, while the wallet action expects Unix epoch
microseconds. The backend performs that typed conversion and preserves Daml
decimals as strings.

The result is a real Token Standard `Allocation` contract. It has its own
contract ID and lifecycle, so the UI queries it through the investor's Ledger
API and displays it separately from `TokenizedPaymentRequest`. At this point the
coin is reserved, not transferred. The next issuer action must supply the
registry's choice context and disclosed contracts to execute the allocation
inside `CompleteTokenizedDvP` alongside the asset allocation.

## 26. Disclosed Contracts Complete The Transaction Context

`CompleteTokenizedDvP` needs more than the payment allocation contract ID. Canton
Coin execution depends on current registry contracts for rules, the open round,
external-party configuration, and the locked holding. The backend requests that
context from the registry immediately before submission.

The registry response has two distinct jobs:

- `choiceContextData` becomes `extraArgs.context`, a value the standard
  `Allocation_ExecuteTransfer` choice reads.
- `disclosedContracts` goes in the JSON Ledger API command envelope, allowing
  the participant to use the referenced contracts and opaque event blobs in
  this transaction without first making them part of our application model.

Our Daml choice still controls the business transaction. It validates the exact
settlement and transfer-leg views for both allocations, exercises both,
archives the purchase agreement, and creates `TokenizedSettlementReceipt`.
Canton commits every effect together. The UI re-queries the consumed request,
agreement, and allocations plus the active holding and receipt. Wallet snapshots
are supporting evidence, not persisted workflow truth.

## 27. The Custodian Creates A Real Delivery Allocation

`ApprovePrivateCreditDelivery` does more than record an external reference. It
constructs the expected `delivery` `AllocationSpecification` from the same
standard request view used at completion, then calls:

```daml
deliveryAllocationCid <- reservePrimaryIssuance
  terms.custodian terms.issuer deliveryAllocation
```

That helper creates `PrivateCreditLockedHolding` and
`PrivateCreditAllocation`, returning the latter as `ContractId Allocation`.
Notice that the business workflow depends on the interface ID, not the concrete
template ID. The concrete token implementation remains free to manage its own
holding lifecycle.

The allocation's `allocation_executeTransferImpl` fetches and validates its
locked holding, archives it, and creates a receiver holding. The standard result
returns `[ContractId Holding]`, which the app stores in the settlement receipt.
That is how an abstract interface result becomes concrete delivery evidence.

## 28. Rollback Is Stronger Than Compensation

Inside `CompleteTokenizedDvP`, payment is exercised before delivery. This order
is deliberate in `testBrokenDeliveryRollsBackPayment`: the mock payment choice
creates a receipt, then the broken delivery allocation aborts.

Because both child exercises belong to one Daml transaction, the ledger does
not need a compensating payment. Canton discards the payment allocation archive,
the mock receipt creation, and every other intermediate effect. Queries after
the failure show both allocations, the request, and the agreement still active.

On success, the browser queries the reverse evidence: both allocations are
archived, the investor holding is active, and `TokenizedSettlementReceipt` is
active with both allocation IDs. Its `settledAt` value comes from `getTime`, not
the browser clock.
