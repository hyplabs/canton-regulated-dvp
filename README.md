# Canton Regulated Settlement POC

A tested Daml proof of concept for a private, compliance-gated settlement
workflow on Canton.

V1 demonstrates contract authorization, privacy, deadlines, active eligibility,
and single-use state transitions. It is intentionally **DvP-ready rather than
full DvP**: payment and delivery are evidence references in V1; actual token
movement belongs in the V2 token-standard integration.

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

## Repository Layout

- `daml/model/` - uploadable production templates; no `daml-script` dependency.
- `daml/tests/` - demo setup and Daml Script test suite.
- `daml/multi-package.yaml` - model/test package workspace.
- `docs/` - architecture, learning guide, strategy, research, and runbook.
- `scripts/test.sh` - builds both packages and executes all scripts.

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

See `docs/runbook.md` for environment and troubleshooting details.

## Current Status

- Model and test DARs build successfully.
- All 13 Daml scripts pass locally.
- Production and test packages are separated.
- JDK 21 is provisioned locally for this workspace.
- LocalNet, JSON Ledger API, token-standard allocations, and the stakeholder UI
  remain V2/V3 work.
