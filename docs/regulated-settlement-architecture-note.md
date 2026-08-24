# Regulated Settlement Architecture

Date: 2026-08-20

## Purpose

V1 proves that Daml can enforce a private regulated-settlement workflow across
an issuer, investor, verifier, custodian, and auditor. It models payment and
delivery evidence but does not claim to transfer token-standard assets yet.

This document intentionally describes the retained V1 learning model. The
presented V3 path now uses the two-allocation integration described in
`tokenized-payment-architecture.md`.

## Parties

- `issuer` creates an offer and co-finalizes settlement.
- `investor` accepts the offer and prepares payment evidence.
- `verifier` issues eligibility, approves the specific agreement, and
  co-finalizes settlement.
- `custodian` confirms delivery and becomes a signatory before settlement.
- `auditor` observes only the final receipt.

## Lifecycle

1. Verifier creates `EligibilityAttestation` for an investor and asset class.
2. Issuer creates `AssetOffer` with offer and settlement deadlines.
3. Investor exercises `AcceptOffer`; the active attestation is fetched and
   validated, producing `CompliancePending`.
4. Verifier exercises `ApproveCompliance`, binding the attestation to the
   settlement and producing `PurchaseAgreement`.
5. Investor exercises `PreparePayment`, producing `PaymentPrepared`.
6. Custodian exercises `ConfirmDelivery`, producing `ReadyToSettle` and adding
   custodian authority.
7. Issuer and verifier jointly exercise `FinalizeSettlement`. The attestation is
   fetched again and must still be active and unexpired.
8. The transaction produces `SettlementReceipt`, visible to the auditor.

Every lifecycle choice is consuming. A previous state cannot be exercised a
second time, so duplicate payment preparation and duplicate settlement are
rejected by contract activeness.

## Authorization

| Contract | Signatories | Observers | Transition controller |
| --- | --- | --- | --- |
| `EligibilityAttestation` | verifier | investor | verifier withdraws |
| `AssetOffer` | issuer | investor | investor accepts; issuer cancels |
| `CompliancePending` | issuer, investor | verifier | verifier approves/rejects |
| `PurchaseAgreement` | issuer, investor, verifier | custodian | investor prepares payment |
| `PaymentPrepared` | issuer, investor, verifier | custodian | custodian confirms delivery |
| `ReadyToSettle` | issuer, investor, verifier, custodian | none | issuer + verifier finalize |
| `SettlementReceipt` | issuer, investor, verifier, custodian | auditor | terminal |

Direct creation cannot bypass the claimed authorities: an agreement requires
verifier authorization, while a ready state or receipt also requires custodian
authorization. As always in Daml, all signatories may jointly authorize a
contract; that is agreement, not a bypass.

## Eligibility And Deadlines

The attestation contract ID and `settleBefore` deadline travel through every
state. Eligibility is checked at acceptance, compliance approval, payment
preparation, and final settlement. Fetching the attestation at finalization also
proves it has not been withdrawn.

Expired states expose cleanup choices for the issuer. Settlement itself requires
ledger time to be strictly before `settleBefore`.

## Privacy

- The custodian cannot see an unaccepted offer.
- The verifier sees the accepted commercial agreement because verifier authority
  is required for the compliance guarantee.
- The auditor is not a stakeholder until the final receipt.
- The custodian does not fetch the private eligibility contract; final
  revalidation is performed by the verifier during joint finalization.

## V1 Boundary

`paymentRef` and `deliveryRef` remain evidence identifiers in V1. They are useful
for learning staged authority and as a fallback workflow, but they are not the
presented DvP implementation. V2 replaces both references with exact Token
Standard allocation legs and executes them atomically; see
`tokenized-payment-architecture.md`.
