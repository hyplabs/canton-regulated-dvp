# Regulated DvP Demo Guide

This is the presenter entry point. The recommended walkthrough takes about five
minutes and settles a private-credit note against real Canton Coin on Quickstart
LocalNet.

## The Story

A lender issues 1,000 units of a restricted private-credit note to an
institutional investor for 10 Canton Coin. The investor must be eligible, a
verifier must approve the purchase, and a custodian must reserve the note.

Before settlement, the ledger contains two locked obligations:

- the investor's standard wallet allocation for 10 Canton Coin;
- the custodian's private-credit allocation for 1,000 note units.

The issuer then exercises one Daml choice. Canton transfers both legs and emits
one auditor-visible receipt. If either transfer fails, neither one commits.

## What This Demonstrates

- Need-to-know contract visibility instead of global broadcast.
- Business authority enforced by Daml, not UI permissions.
- Eligibility rechecked against active ledger state at settlement.
- A custom request discovered through the Canton Token Standard.
- A real Canton Coin wallet allocation and registry transfer.
- An app-owned asset that implements standard `Holding` and `Allocation`.
- Atomic rollback across payment and delivery child exercises.

## Roles

| Role | Responsibility | Minimal LocalNet party |
| --- | --- | --- |
| Issuer | Offers the note, receives cash, executes DvP | App provider |
| Investor | Accepts the note and reserves Canton Coin | App user |
| Verifier | Attests eligibility and approves settlement | App provider |
| Custodian | Tokenizes and reserves the note units | App provider |
| Auditor | Reads the completed DvP receipt | App provider |

The Daml tests use five distinct parties. Quickstart combines provider-side
roles for a compact two-participant demonstration.

## Before The Meeting

```bash
./scripts/test.sh
npm run test:app
npm run test:ui
```

Start an official Quickstart checkout located beside this repository:

```bash
git clone https://github.com/digital-asset/cn-quickstart.git ../cn-quickstart
cd ../cn-quickstart/quickstart
env JAVA_HOME="$HOME/.local/share/canton-jdk-21/usr/lib/jvm/java-21-openjdk-amd64" \
  PATH="$HOME/.dpm/bin:$JAVA_HOME/bin:$PATH" \
  make start
```

Confirm `canton`, `splice`, and `splice-onboarding` are healthy:

```bash
docker ps --format '{{.Names}}  {{.Status}}'
```

Run one noninteractive smoke test before presenting:

```bash
./scripts/localnet-demo.sh --show-negative
```

Then start the browser app:

```bash
npm run app
```

Open:

- Stakeholder app: `http://127.0.0.1:4173`
- Investor allocations: `http://wallet.localhost:2000/allocations`
- Investor wallet: `http://wallet.localhost:2000`
- Provider wallet: `http://wallet.localhost:3000`

Keep these source files ready:

- [TokenizedPayment.daml](../../daml/tokenized-model/daml/Settlement/TokenizedPayment.daml)
- [PrivateCreditToken.daml](../../daml/tokenized-model/daml/Settlement/PrivateCreditToken.daml)
- [TokenizedPaymentTest.daml](../../daml/tokenized-tests/daml/Settlement/TokenizedPaymentTest.daml)

## Browser Walkthrough

Use the role rail to perform the only enabled action at each state:

1. Verifier: **Issue attestation**.
2. Issuer: **Create asset offer**.
3. Investor: **Accept offer**.
4. Verifier: **Approve compliance**.
5. Issuer: **Create payment proposal**.
6. Verifier: **Approve payment request**.
7. Custodian: **Reserve private-credit units**.
8. Investor: **Accept payment request**, then **Allocate Canton Coin**.
9. Issuer: **Execute atomic DvP**.
10. Auditor: inspect the completed state.

At 5 of 6, show both active allocation tabs:

- **Cash**: 10 Amulet, investor to issuer, leg `payment`.
- **Asset**: 1,000 note units, issuer to investor, leg `delivery`.

After execution, Cash and Asset are archived, Holding is active and owned by the
investor, and Receipt references both allocations and the holding. The wallet
balance snapshot is supporting evidence; ledger contract state is authoritative.
The runner waits for both wallet indexes, but warns and continues if aggregate
balances are still indexing or include unrelated reward and fee changes.

## Terminal Walkthrough

Run:

```bash
./scripts/localnet-demo.sh --interactive --show-negative
```

`--interactive` pauses after wallet discovery so you can show the standard
allocation request. If the shared-secret test login appears, enter `app-user`;
no password is required. Do not click Accept in the wallet; return to the
terminal and press Enter so the runner stays repeatable. Add `--verbose` for
contract IDs and complete rejection details.

### Explain The Rejection

The investor attempts the issuer-and-verifier-controlled
`CompleteTokenizedDvP` choice. Canton rejects it with
`DAML_AUTHORIZATION_ERROR`. The runner then queries the request, agreement, cash
allocation, and asset allocation and requires all four to remain active.

Say:

> Canton rejected the whole transaction before any partial settlement became
> ledger state. Both locked legs are still available for the authorized attempt.

### Explain The Success

The provider submits the authorized choice with Canton Coin registry context.
In one transaction:

- the cash allocation transfers Canton Coin to the issuer;
- the asset allocation creates a private-credit holding for the investor;
- both allocations, the request, and the agreement are consumed;
- the DvP receipt is created for the auditor.

Point to `testBrokenDeliveryRollsBackPayment`: it makes the payment child choice
succeed and the asset child choice fail. The post-failure queries prove that
Daml rolled the payment effects back too.

## Expected Output

Starting balances vary because LocalNet state persists. A successful run ends
with this shape:

```text
Atomic DvP settlement complete
  Private-credit units:  1000
  Canton Coin payment:   10.0 Amulet
  Investor balance:      <before> -> <before minus 10> Amulet
  Provider balance:      <before> -> <before plus 10> Amulet
  Settled at:            <ledger time>
  Investor asset holding: <contract ID>
  Request and allocations: consumed
```

With `--show-negative` it also includes:

```text
Canton rejected the investor: DAML_AUTHORIZATION_ERROR
Rejection was atomic; request, agreement, and both allocations remain active
```

## Recovery

- Before cash allocation, `Ctrl+C` leaves no locked Canton Coin; start a new run.
- After allocation, withdraw it from the investor wallet if the runner cannot
  continue. The private-credit allocation also exposes standard withdraw/cancel
  behavior, though the current runner does not automate recovery.
- If services are warming up, wait for `canton` and `splice` to become healthy.
- Stop LocalNet with `make stop`; use `make clean-docker` only for an
  intentional reset because it removes the Quickstart application volumes.

## Honest Limitations

- The private-credit token is a focused primary-issuance implementation, not a
  production registry with splits, merges, fees, or secondary transfers.
- Provider-side business roles share one LocalNet party.
- Shared-secret auth and faucet-funded Canton Coin are LocalNet conveniences.
- The LocalNet runner depends on the official Quickstart APIs and should be
  smoke tested once before each live presentation.
