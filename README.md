# Canton Regulated Settlement POC

A tested Daml proof of concept for a private, compliance-gated settlement
workflow with a Canton Token Standard payment path.

V1 demonstrates contract authorization, privacy, deadlines, active eligibility,
and single-use state transitions. V2 publishes a standard `AllocationRequest`,
validates a funded `Allocation`, and executes its transfer before the workflow
can reach `PaymentPrepared`. The LocalNet runner proves that path with real
Canton Coin and separate app-provider/app-user participants.

The V3 browser UI is backed by the real JSON Ledger API. A verifier creates an
`EligibilityAttestation`, the issuer creates an `AssetOffer`, and the investor
exercises `AcceptOffer` through its own participant. The UI then shows the
archived offer and active `CompliancePending` contract returned by Canton. The
verifier can approve that review to create the jointly signed
`PurchaseAgreement`. Issuer, verifier, and investor then authorize the
token-standard payment request, which the standard wallet discovers without
app-specific parsing. The investor can now allocate the exact Canton Coin
payment from that wallet request, and the UI confirms the active standard
`Allocation` from the investor participant. The issuer then executes that
allocation with registry-provided disclosures in the same transaction that
archives the request and agreement and creates `PaymentPrepared`.

This remains **a payment-versus-workflow POC, not full DvP**. Unit tests use a
small allocation implementation, while the LocalNet path uses the real Canton
Coin registry. Delivery is still a custodian evidence reference; a true DvP
claim requires a second tokenized delivery leg.

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
       payment proposal/approval/acceptance
                    |
                    v
       TokenizedPaymentRequest (standard interface)
                    |
          real Canton Coin Allocation
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

The minimal LocalNet run uses two application parties: the app-provider party
plays issuer, verifier, custodian, and auditor, while the app-user party plays
the investor. The Daml tests retain five distinct business parties. A production
topology with independently hosted issuer and verifier parties would also need
an interactive multi-party submission or another staged approval for their
jointly controlled completion choice.

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
- `app/` - local backend adapter, stakeholder UI, and focused tests.
- `docs/` - architecture, learning guide, strategy, research, and runbook.
- `scripts/test.sh` - builds every package and executes both test suites.
- `scripts/localnet-demo.sh` - uploads both production DARs and executes a real
  Canton Coin settlement against a running Quickstart LocalNet.
- `scripts/localnet-demo-runtime.sh` - container-side Ledger and wallet API
  workflow used by the LocalNet runner.
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

With Quickstart LocalNet running, execute the real Canton Coin path:

```bash
./scripts/localnet-demo.sh
```

To run the stakeholder UI after the model DAR has been uploaded to LocalNet:

```bash
npm install
npm run app
```

Open `http://127.0.0.1:4173`. Start as Verifier, then follow the available Issuer
and Investor actions. The contract inspector retains each state for comparison.

Run the application tests with:

```bash
npm run test:app
npm run test:ui
```

Start with `docs/demo-guide.md` for the presentation walkthrough and
`docs/runbook.md` for environment and troubleshooting details.
The latest stopped-stack timing and ledger evidence are recorded in
`docs/demo-rehearsal.md`.
The exact real-registry handoff is in
`docs/localnet-integration-milestone.md`.

## Current Status

- Both production DARs and both test DARs build successfully.
- All 13 V1 scripts and 7 V2 scripts pass locally.
- Production and test packages remain separated.
- The V2 payment request implements Token Standard `AllocationRequest` V1 and
  consumes a matching `Allocation` V1 through its standard interface choice.
- Quickstart LocalNet is running with separate app-provider and app-user
  participants, and both production DARs are uploaded to each.
- The wallet discovers the request without app-specific parsing, allocates real
  Canton Coin, and the registry allocation executes atomically with the
  regulated workflow transition.
- The repeatable LocalNet runner verifies consumed request/allocation state,
  final receipt creation, sender/receiver balance changes, and atomic rejection
  of an investor's unauthorized settlement attempt.
- The V3 UI reaches a wallet-discoverable `TokenizedPaymentRequest` through real
  provider and app-user submissions, then creates and inspects a real Canton
  Coin allocation and executes it atomically to `PaymentPrepared`; participant
  and wallet credentials remain in the local backend.
- JDK 21 is provisioned locally for this workspace.
- Custodian delivery and receipt actions in the UI, a tokenized delivery leg,
  and broader LocalNet failure coverage remain upcoming V2/V3 work.
