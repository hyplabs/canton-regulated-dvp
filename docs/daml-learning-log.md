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
  transferLegs = TextMap.fromList [(paymentLegId, paymentLeg)]
  meta
```

Our request has one leg: investor sends the configured payment amount to the
issuer. `TextMap` gives each leg a stable textual ID so allocations can identify
which part of a multi-leg settlement they fund.

## 12. Interface Contract IDs

The completion choice accepts this type:

```daml
allocationCid : ContractId Allocation
```

That is an interface contract ID, not the ID of one concrete token template.
Any active contract implementing `Allocation` can be supplied. The model reads
it through the interface:

```daml
allocation <- fetch @Allocation allocationCid
let allocationView = view @Allocation allocation
```

Tests create a concrete `MockAllocation` and convert its ID with
`toInterfaceContractId`. A LocalNet integration will pass the ID of a real
registry allocation through exactly the same choice argument.

## 13. Never Trust A Contract ID By Type Alone

The interface type proves that the contract supports allocation behavior. It
does not prove that it funds this purchase. The model therefore compares:

- `transferLegId` against the expected `payment` leg ID.
- The complete `TransferLeg`, including sender, receiver, amount, and instrument.
- The complete `SettlementInfo`, including request ID, agreement contract ID,
  and both deadlines.

Only after all three match does it execute:

```daml
_ <- exercise allocationCid (Allocation_ExecuteTransfer extraArgs)
```

`testMismatchedAllocationCannotAdvanceWorkflow` changes the amount by one unit.
The interface type is still correct, but the business identity is wrong, so the
transaction fails.

## 14. One Transaction Composes Multiple Contracts

`CompleteTokenizedPayment` is `postconsuming`. On success it consumes the
request after its body has:

1. Fetched and checked the agreement and eligibility attestation.
2. Exercised the allocation's transfer choice.
3. Archived the V1 `PurchaseAgreement`.
4. Created `PaymentPrepared`.

Daml transactions are atomic. If allocation execution or any validation fails,
none of those effects commit. The mismatch test queries the allocation,
agreement, and request afterward and proves all three remain active. It also
proves that no mock transfer receipt was created.

This is stronger than application code that performs a transfer and then makes
a second API call to update workflow state. There is no committed intermediate
state where only one side happened.

## 15. Authority Can Be Granted In Advance

The tokenized request is signed by issuer, investor, and verifier. Its completion
choice is controlled by issuer and verifier:

```daml
signatory terms.issuer, terms.investor, terms.verifier
controller terms.issuer, terms.verifier
```

The investor authorizes the request when it is created. That parent authority is
available to the direct child allocation exercise, whose standard controllers
include sender, receiver, and executor. The verifier remains a required
controller for the app-level compliance gate.

The wrong-party test submits as the investor alone. It fails because prior
authorization does not let the investor impersonate the issuer and verifier who
control completion.

## 16. Test Implementations Versus Real Registries

`MockAllocation` is deliberately small: it implements the real standard
interface, consumes itself on execution, and creates a receipt. It does not
track balances, lock holdings, calculate fees, or represent a production token.

That distinction lets the tests answer one precise question: "Does our app
integrate with any conforming allocation contract correctly?" The LocalNet
runner answers the complementary question: "Can a real wallet and token
registry fund and execute this request end to end?" Both now pass.

The official comparison implementation is
`../resources/cn-quickstart/quickstart/daml/licensing`, and the fuller DvP
example is in the sibling Quickstart token-standard test sources.

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

The first test fixture created `TokenizedPaymentRequest` with one script command:

```daml
submit (actAs [issuer, investor, verifier]) do
  createCmd TokenizedPaymentRequest with ...
```

That is valid when one participant and user can act for every party. In the
Quickstart topology, the issuer and investor are hosted by different
participants, so neither participant may claim both parties in one command.

The production model now accumulates authority over three ordinary actions:

```text
TokenizedPaymentProposal             signatory issuer
  -> ApproveTokenizedPayment          controller verifier
ApprovedTokenizedPayment             signatories issuer + verifier
  -> AcceptTokenizedPayment           controller investor
TokenizedPaymentRequest              signatories issuer + verifier + investor
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
allocation as a child of `CompleteTokenizedPayment`. The transfer, agreement
archive, request consumption, and `PaymentPrepared` creation either all commit
or all fail.

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

Payment authorization accumulates authority in three contracts:

```text
TokenizedPaymentProposal       issuer signatory
ApprovedTokenizedPayment       issuer + verifier signatories
TokenizedPaymentRequest        issuer + verifier + investor signatories
```

The provider submits the issuer proposal and verifier approval in minimal
LocalNet; the app-user participant submits investor acceptance. Each transition
reuses the parent-authority rule from the regulated workflow.

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
inside `CompleteTokenizedPayment`.

## 26. Disclosed Contracts Complete The Transaction Context

`CompleteTokenizedPayment` needs more than the allocation contract ID. Canton
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
settlement and transfer-leg views, exercises the allocation, archives the
purchase agreement, and creates `PaymentPrepared`. Canton commits every effect
together. The UI re-queries all four contracts after submission and reports
wallet snapshots as supporting evidence; those balances are not persisted as
workflow truth.

## 27. Evidence References Advance The State Machine

`ConfirmDelivery` is a consuming choice on `PaymentPrepared`. Its controller is
the custodian, and its `deliveryRef` argument must be non-empty. A successful
exercise archives the paid state and creates `ReadyToSettle` with both the
payment and delivery references.

The reference is evidence metadata, not a token transfer. This keeps the POC's
scope honest: Canton Coin is real, while note delivery is represented by the
custodian's external-system reference. The UI asks the custodian for that value
and then re-queries both contracts, so the 5-of-6 timeline state comes from the
ledger transition rather than from the input field.
