# Canton Regulated Settlement POC

A tested Daml proof of concept for private, compliance-gated delivery-versus-
payment (DvP) on Canton.

The demo settles a restricted private-credit note against Canton Coin. An
eligibility verifier, issuer, investor, and custodian accumulate authority over
ordinary Daml choices. The custodian reserves the note in a Token Standard
allocation, the investor wallet reserves Canton Coin in another allocation,
and the issuer executes both allocations in one transaction. Either cash and
asset move together, or neither moves.

## Version Strategy

- **V1: learning model.** `Settlement.Regulated` teaches parties, signatories,
  observers, controllers, deadlines, privacy, and staged payment/delivery
  evidence. It remains useful source material and a fallback demo.
- **V2: integration model.** `Settlement.TokenizedPayment` and
  `Settlement.PrivateCreditToken` implement a two-leg Token Standard request,
  private-credit holdings and allocations, and atomic DvP.
- **V3: presentation app.** The browser and local backend submit real JSON
  Ledger API and wallet commands, retain archived contract evidence, and finish
  on an auditor-visible DvP receipt.

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
       issuer proposal -> verifier approval
                    |
                    v
          DeliveryApprovalPending
                    |
      custodian reserves private-credit units
                    |
                    v
         ApprovedTokenizedPayment
                    |
             investor acceptance
                    |
                    v
       TokenizedPaymentRequest (standard interface)
                    |
       +------------+-------------+
       |                          |
 Canton Coin Allocation   PrivateCreditAllocation
       |                          |
       +------ CompleteTokenizedDvP
                    |
                    v
 TokenizedSettlementReceipt + investor asset Holding
```

`CompleteTokenizedDvP` validates both allocations against the same settlement
reference, exact transfer legs, and deadlines. It then exercises both standard
`Allocation_ExecuteTransfer` choices and archives the agreement in one Daml
transaction. A failure in either child transfer rolls back every effect.

The minimal Quickstart topology uses two application parties: app-provider
plays issuer, verifier, custodian, and auditor; app-user plays investor. The
Daml tests retain five distinct business parties. Independently hosted issuer
and verifier parties would need interactive multi-party submission or another
staged approval for the jointly controlled completion choice.

## Guarantees Proven By Tests

- Wrong investors cannot use another party's eligibility attestation.
- Expired or withdrawn eligibility blocks settlement.
- Offer and settlement deadlines are enforced.
- Direct contract creation cannot bypass verifier or custodian authority.
- Consuming choices make lifecycle transitions single-use.
- Offer visibility is limited to issuer and intended investor.
- Both payment and delivery allocations must match the exact request.
- Inactive, expired, or wrong-settlement allocations cannot settle.
- The investor cannot invoke issuer-and-verifier completion.
- If delivery execution fails after payment execution is attempted, the payment
  allocation remains active and no transfer receipt is committed.
- A successful DvP consumes both allocations and creates an investor-owned
  private-credit holding plus an auditor-visible receipt.

## Repository Layout

- `daml/model/` - uploadable V1 regulated workflow templates.
- `daml/tests/` - V1 Daml Script tests and setup.
- `daml/tokenized-model/` - uploadable two-leg DvP and private-credit token model.
- `daml/tokenized-tests/` - Token Standard mocks and DvP tests.
- `daml/vendor/` - pinned Token Standard API DARs with checksums.
- `app/` - local backend adapter, stakeholder UI, Node tests, and Playwright tests.
- `docs/` - architecture, Daml learning guide, demo guide, and runbook.
- `scripts/test.sh` - builds all four Daml packages and runs both script suites.
- `scripts/localnet-demo.sh` - uploads production DARs and runs the full DvP flow
  against Quickstart LocalNet.
- `.github/workflows/daml.yml` - reproducible JDK, DPM, build, and test CI.

Official source snapshots are kept outside this repository in the sibling
`../resources/` directory.

## Run It

Prerequisites are DPM with Daml SDK `3.5.2` and JDK 21.

```bash
./scripts/test.sh
```

Run one repeatable script setup:

```bash
cd daml/tokenized-tests
dpm test -p setupTokenizedPaymentDemo
```

With Quickstart LocalNet running:

```bash
./scripts/localnet-demo.sh --show-negative
```

Start the stakeholder app after the DARs have been uploaded:

```bash
npm install
npm run app
```

Open `http://127.0.0.1:4173`. Follow the enabled role action from Verifier to
Issuer, Investor, Custodian, and finally Auditor. The contract inspector keeps
the cash allocation, asset allocation, resulting holding, and receipt available
for comparison.

Run application tests with:

```bash
npm run test:app
npm run test:ui
```

Start with `docs/demo-guide.md` for the presentation walkthrough,
`docs/runbook.md` for setup and troubleshooting, and
`docs/daml-learning-log.md` to learn the language through this implementation.

## Current Status

- All four DARs build successfully.
- All 13 V1 scripts and 8 tokenized DvP scripts pass locally.
- The backend suite passes 16 tests and Playwright passes 4 browser tests,
  including the complete role flow and a 390px mobile viewport.
- The earlier real Canton Coin payment path was verified on Quickstart LocalNet.
- The full two-allocation runner and UI are implemented. Their current LocalNet
  rerun remains pending because Docker Desktop WSL integration is unavailable
  in this shell; no new real-runtime result is claimed yet.
- DevNet identity, deployment, and independently hosted multi-party completion
  remain outside this local proof of concept.
