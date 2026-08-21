# Regulated Settlement Demo Guide

This is the presenter entry point for the Canton regulated-settlement POC. The
recommended walkthrough takes about five minutes and uses a real Canton Coin
allocation on Quickstart LocalNet.

## The Story

A private-credit issuer offers 1,000 units of a restricted note to an
institutional investor. The investor must have an active eligibility
attestation, compliance must approve the purchase, and a custodian must confirm
delivery before an auditor-visible receipt can be created.

The investor's standard Canton wallet discovers the app's payment request and
allocates 10 Canton Coin. The registry transfer and the regulated workflow
advance in one atomic Daml transaction.

## What This Demonstrates

- Need-to-know visibility rather than broadcasting every contract globally.
- Business authorization enforced by Daml, not by disabled UI buttons.
- Active compliance evidence checked at acceptance and settlement.
- A custom application contract discovered through the Canton Token Standard.
- Real wallet balances and registry-provided allocation execution.
- Atomic failure: a rejected command leaves every input contract active.

## Demo Roles

| Business role | Responsibility | Minimal LocalNet party |
| --- | --- | --- |
| Issuer | Offers the private-credit note and receives payment | App provider |
| Investor | Accepts the offer and pays | App user |
| Verifier | Attests eligibility and approves compliance | App provider |
| Custodian | Confirms delivery evidence | App provider |
| Auditor | Sees the final receipt | App provider |

The Daml tests use five distinct parties. Quickstart's minimal two-party topology
combines the operational roles under the provider for a compact demonstration.

## Before The Meeting

From the POC repository, build and test all packages:

```bash
./scripts/test.sh
```

Start Quickstart from `../resources/cn-quickstart/quickstart`:

```bash
env JAVA_HOME="$HOME/.local/share/canton-jdk-21/usr/lib/jvm/java-21-openjdk-amd64" \
  PATH="$HOME/.dpm/bin:$JAVA_HOME/bin:$PATH" \
  make start
```

Confirm `canton`, `splice`, and `splice-onboarding` are healthy:

```bash
docker ps --format '{{.Names}}  {{.Status}}'
```

Open these tabs before presenting:

- Stakeholder UI: `http://127.0.0.1:4173`
- Investor allocations: `http://wallet.localhost:2000/allocations`
- Investor wallet: `http://wallet.localhost:2000`
- Provider wallet: `http://wallet.localhost:3000`
- [Regulated.daml](../daml/model/daml/Settlement/Regulated.daml)
- [TokenizedPayment.daml](../daml/tokenized-model/daml/Settlement/TokenizedPayment.daml)

## Browser Walkthrough

Start the stakeholder app with `npm run app`, open
`http://127.0.0.1:4173`, and use the role rail to perform these actions:

1. Verifier issues eligibility.
2. Issuer creates the private-credit offer.
3. Investor accepts it.
4. Verifier approves compliance.
5. Issuer proposes payment.
6. Verifier approves the payment request.
7. Investor accepts the request and allocates 10 Canton Coin.
8. Issuer executes the atomic payment.
9. Custodian confirms the delivery reference.
10. Issuer finalizes settlement, then switch to Auditor.

At `SettlementReceipt`, show all six green timeline steps and the inspector
tabs. The Request, Agreement, Allocation, Prepared, and Ready tabs are archived;
Receipt is active with payment, delivery, eligibility, auditor, and timestamp
evidence. This is the recommended visual path. The terminal walkthrough below
adds the wrong-party rejection and compact balance output.

## Full Workflow Command

Run from the POC repository in a terminal visible to the audience:

```bash
./scripts/localnet-demo.sh --interactive --show-negative
```

Add `--verbose` for a technical audience that wants contract IDs and the full
authorization error. Run without options for a fully automated smoke test.

## Five-Minute Walkthrough

### 0:00 - Set The Business Context

Say:

> A lender is selling a restricted private-credit note. Payment must not settle
> unless the intended investor is eligible, compliance approves this purchase,
> and every amount and deadline matches.

Explain that the demo uses 1,000 note units and a 10 Canton Coin payment.

### 0:45 - Show The Contract Model

In `Regulated.daml`, point to:

- `EligibilityAttestation` for scoped, expiring compliance evidence.
- `AcceptOffer` and `ApproveCompliance` for investor and verifier authority.
- `FinalizeSettlement` for the final compliance recheck.

In `TokenizedPayment.daml`, point to:

- `interface instance AllocationRequest` for standard wallet discovery.
- `CompleteTokenizedPayment` for exact allocation validation and execution.

Avoid reading the whole file. The important message is that each state names who
can see it, who signs it, and who may advance it.

### 1:30 - Start The Workflow

Run the recommended command. The first six lines show:

1. Eligibility attested.
2. Private-credit units offered.
3. Investor accepted.
4. Compliance approved.
5. Payment request authorized.
6. Standard wallet discovered the custom request.

This is the interoperability moment: the wallet was not programmed specifically
for `TokenizedPaymentRequest`; it recognizes the standard interface.

### 2:30 - Show The Wallet

The runner pauses after discovery. Open the investor allocations tab and show:

- Sender and receiver.
- 10 Amulet amount (`Amulet` is Canton Coin's API instrument name).
- Settlement deadline.
- Private-credit metadata and settlement reference.

Do not click **Accept**. Return to the terminal and press Enter; the runner calls
the same wallet allocation operation so the walkthrough remains repeatable.

### 3:15 - Show Ledger-Enforced Rejection

The `--show-negative` mode has the investor attempt the provider-controlled
completion choice. Canton returns `DAML_AUTHORIZATION_ERROR`.

The runner then queries the ledger and proves that the payment request, purchase
agreement, and Canton Coin allocation are all still active. Say:

> The application did not catch this after the fact. Canton rejected the entire
> transaction, so no partial settlement occurred.

### 4:00 - Complete Settlement

The provider executes the correctly authorized transaction. In one transaction:

- The Canton Coin allocation transfers to the provider.
- The purchase agreement and payment request are consumed.
- `PaymentPrepared` is created.

The custodian evidence is then confirmed and the final receipt is created.

### 4:40 - Close With Evidence And Scope

Show the final balance lines. The investor decreases by 10 Amulet and the
provider increases by 10. The runner also verifies that the request and
allocation are consumed.

Close with:

> This proves regulated payment-versus-workflow with real Canton Coin. The next
> architectural milestone is tokenizing the note delivery leg so both assets
> execute as full delivery-versus-payment.

## Expected Output

The balance starting values vary because LocalNet state persists, but a
successful run ends with this shape:

```text
Settlement complete
  Private-credit units:  1000
  Canton Coin payment:   10.0 Amulet
  Investor balance:      <before> -> <before minus 10> Amulet
  Provider balance:      <before> -> <before plus 10> Amulet
  Request and allocation: consumed
```

With `--show-negative`, the output must also include:

```text
Canton rejected the investor: DAML_AUTHORIZATION_ERROR
Rejection was atomic; request, agreement, and allocation remain active
```

## Recovery

- Before allocation, `Ctrl+C` leaves no locked Canton Coin. Start a new run.
- After allocation, use the investor wallet's Allocations page to withdraw an
  allocation if the script cannot continue.
- If a service is still warming up, wait for `canton` and `splice` to report
  healthy and rerun the command.
- Stop LocalNet with `make stop` from the Quickstart directory.
- `make clean` removes persisted LocalNet state and should be reserved for an
  intentional reset.

## Honest Limitations

- Delivery is custodian evidence, not a tokenized note allocation, so this is
  not yet full DvP.
- The minimal LocalNet run has two application parties and combines provider-side
  roles.
- Shared-secret authentication and the wallet faucet are LocalNet conveniences,
  not production security choices.
- The test suite covers more party separation and failure cases than this short
  presentation path.
