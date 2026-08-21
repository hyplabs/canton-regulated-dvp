# Canton Regulated Settlement POC

A tested Daml proof of concept for a private, compliance-gated settlement
workflow with a Canton Token Standard payment path.

V1 demonstrates contract authorization, privacy, deadlines, active eligibility,
and single-use state transitions. The first V2 slice now publishes a standard
`AllocationRequest`, validates a funded `Allocation`, and executes its transfer
before the workflow can reach `PaymentPrepared`.

This remains **a payment-versus-workflow POC, not full DvP**. Tests use a small
allocation implementation instead of a real token registry, and delivery is
still a custodian evidence reference. A true DvP claim requires a LocalNet token
registry and a second tokenized delivery leg.

## Workflow

```text
EligibilityAttestation + AssetOffer
                    |
                    v
            CompliancePending
                    |
                    v
            PurchaseAgreement
                    |
             +------+------+
             |             |
             v             v
      PreparePayment   TokenizedPaymentRequest
          (V1)          + funded Allocation
             |             |
             +------+------+
                    v
             PaymentPrepared
                    |
                    v
              ReadyToSettle
                    |
                    v
            SettlementReceipt
```

The verifier explicitly binds its attestation to the agreement. Finalization is
jointly controlled by the issuer and verifier and re-fetches the attestation, so
an expired or withdrawn credential cannot produce a receipt. Custodian authority
is added when delivery is confirmed.

## Guarantees Proven By Tests

- Wrong investors cannot use another party's attestation.
- Expired attestations cannot accept an offer.
- Withdrawn or expired attestations block final settlement.
- The settlement deadline blocks late settlement.
- A non-issuer cannot finalize settlement.
- Payment preparation is single-use.
- Issuer and investor cannot bypass verifier authority by directly creating an
  agreement.
- Issuer and investor cannot directly create a receipt without verifier and
  custodian authority.
- Offer visibility is limited to issuer and intended investor.
- Invalid offer values are rejected.
- A matching token-standard allocation executes before payment preparation.
- An allocation with the wrong amount cannot advance the workflow.
- An investor cannot invoke issuer-and-verifier payment completion.
- Allocation execution and workflow advancement are atomic.

## Repository Layout

- `daml/model/` - uploadable production templates; no `daml-script` dependency.
- `daml/tests/` - demo setup and Daml Script test suite.
- `daml/tokenized-model/` - uploadable Token Standard payment integration.
- `daml/tokenized-tests/` - mock allocation plus integration scripts.
- `daml/vendor/` - pinned Token Standard API DARs with checksums.
- `daml/multi-package.yaml` - four-package Daml workspace.
- `docs/` - architecture, learning guide, strategy, research, and runbook.
- `scripts/test.sh` - builds every package and executes both test suites.
- `.github/workflows/daml.yml` - reproducible JDK, DPM, build, and test CI.

Official source snapshots are kept outside this repository in the sibling
`../resources/` directory.

## Run It

Prerequisites are DPM with Daml SDK `3.5.2` and JDK 21.

```bash
./scripts/test.sh
```

To execute only the repeatable demo setup:

```bash
cd daml/tests
dpm test -p setupRegulatedSettlementDemo
```

To execute the token-standard-backed demo path:

```bash
cd daml/tokenized-tests
dpm test -p setupTokenizedPaymentDemo
```

See `docs/runbook.md` for environment and troubleshooting details.
The exact real-registry handoff is in
`docs/localnet-integration-milestone.md`.

## Current Status

- Both production DARs and both test DARs build successfully.
- All 13 V1 scripts and 7 V2 scripts pass locally.
- Production and test packages remain separated.
- The V2 payment request implements Token Standard `AllocationRequest` V1 and
  consumes a matching `Allocation` V1 through its standard interface choice.
- JDK 21 is provisioned locally for this workspace.
- LocalNet, a real registry allocation, a tokenized delivery leg, JSON Ledger
  API integration, and the stakeholder UI remain upcoming V2/V3 work.
