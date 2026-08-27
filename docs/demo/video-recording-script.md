# Video Recording Script

Use this as the teleprompter and shot list for a five-to-six-minute recorded
demo. The browser walkthrough is the main story. The authorization rejection is
captured from a separate terminal run and should be introduced that way.

## Recording Goal

Show that an eligible institutional investor can purchase 1,000 private-credit
units for 10 Canton Coin, with payment and delivery committed atomically on
Quickstart LocalNet.

The viewer should leave with four ideas:

1. Different business roles contribute authority at different stages.
2. An unmodified Canton Coin wallet discovers the standard payment request.
3. Canton rejects an unauthorized settlement without changing ledger state.
4. Authorized settlement transfers both legs together and creates an auditable
   receipt.

## Preflight

Complete this before screen recording:

- Run `./scripts/test.sh`, `npm run test:app`, and `npm run test:ui`.
- Confirm `canton`, `splice`, and `splice-onboarding` are healthy.
- Run `./scripts/localnet-demo.sh --show-negative` once as a smoke test.
- Start the stakeholder app with `npm run app`.
- Open `http://127.0.0.1:4173` and reset only a completed browser workspace.
- Open `http://wallet.localhost:2000/allocations` and log in as `app-user` if
  prompted.
- Confirm there are no distracting active requests from abandoned rehearsals.
  Use the runbook's intentional LocalNet reset procedure only if old state must
  be removed; it deletes Quickstart application volumes.
- Keep the stakeholder app, investor allocations page, and a terminal ready as
  separate windows.
- Record at a desktop viewport around 1440 by 900, hide notifications, and use a
  readable terminal font.

Do not use `--verbose` in the recorded terminal segment. Full contract IDs and
the complete interpretation error add noise without strengthening the story.

## Segment A: Browser Happy Path

### 0:00-0:25 - Introduce The Transaction

**Screen:** Stakeholder app on the initial Verifier view.

**Say:**

> This proof of concept models the primary issuance of a restricted
> private-credit note on Canton. An institutional investor will purchase 1,000
> units from the issuer for 10 Canton Coin. The goal is delivery versus payment:
> the cash and asset must move together, or neither can move.

### 0:25-0:45 - Introduce The Roles

**Screen:** Move the pointer down the role rail without clicking actions.

**Say:**

> Five business roles participate. The issuer sells the note, the investor buys
> it, the verifier enforces eligibility, the custodian controls the asset
> record, and the auditor receives the final settlement evidence. Quickstart
> combines the provider-side roles into one LocalNet party, while the investor
> is hosted separately.

### 0:45-1:05 - Record Eligibility

**Action:** As Verifier, click **Issue attestation**. Pause on **Eligibility
active** and the contract inspector.

**Say:**

> The verifier first records that this investor is eligible for the
> private-credit asset class. This is active ledger state with an expiration
> time, not a frontend flag. The inspector confirms the contract's created event
> directly through the participant Ledger API.

### 1:05-1:30 - Create The Offer

**Action:** Select Issuer and click **Create asset offer**. Pause on **Offer
open**.

**Say:**

> The issuer offers 1,000 units for 10 Canton Coin and sets offer and settlement
> deadlines. At this point, no cash or asset has moved. Canton is recording the
> proposed commercial terms and who is authorized to act next.

### 1:30-1:50 - Investor Acceptance

**Action:** Select Investor and click **Accept offer**. Briefly select the
**Offer** and **Compliance** inspector tabs.

**Say:**

> Only the intended investor can accept. The offer is consumed, or archived,
> so it cannot be accepted twice. Canton creates a compliance-pending contract
> carrying the issuer and investor's accumulated authority.

### 1:50-2:10 - Compliance Approval

**Action:** Select Verifier and click **Approve compliance**. Pause on
**Agreement active**.

**Say:**

> The verifier rechecks the active eligibility record and approves the purchase.
> The pending state is archived and replaced by the purchase agreement. We now
> have an approved deal, but settlement has not happened.

### 2:10-2:45 - Define The Two Legs

**Action:** Select Issuer and click **Create payment proposal**. Select Verifier
and click **Approve payment request**.

**Say:**

> The issuer now defines one settlement with two exact obligations: the investor
> pays 10 Canton Coin to the issuer, and the issuer delivers 1,000 note units to
> the investor. The verifier approves these instructions, including their shared
> settlement reference and deadlines.

### 2:45-3:10 - Reserve The Asset

**Action:** Select Custodian and click **Reserve private-credit units**. Pause on
the **Asset** inspector tab.

**Say:**

> The custodian is the asset-side authority. It creates a standard private-credit
> allocation backed by a locked holding. Those 1,000 units are now reserved for
> this settlement and cannot be silently substituted with another asset or
> another transaction.

### 3:10-3:30 - Publish The Wallet Request

**Action:** Select Investor and click **Accept payment request**. Stop before
clicking **Allocate Canton Coin**.

**Say:**

> The investor accepts the complete settlement request. That produces a contract
> signed by the issuer, investor, verifier, and custodian, and exposes both named
> legs through Canton's Allocation Request standard.

### 3:30-4:00 - Prove Wallet Interoperability

**Screen:** Switch to `http://wallet.localhost:2000/allocations`. Show the
current request and its `delivery` and `payment` rows. Do not click **Accept**.

**Say:**

> This is the official Quickstart Canton Coin wallet, not a wallet we built or
> modified. It discovered our custom Daml request through the Canton Token
> Standard. It can see the investor-to-issuer payment leg for 10 Canton Coin and
> the associated asset-delivery leg.

**Action:** Return to the stakeholder app.

### 4:00-4:25 - Reserve Canton Coin

**Action:** Click **Allocate Canton Coin**. Show the **Cash** and **Asset** tabs
while the timeline says **5 of 6 complete**.

**Say:**

> The investor wallet has now locked 10 Canton Coin for the payment leg. Both
> allocations are active: cash is reserved from investor to issuer, and the note
> is reserved from issuer to investor. Nothing has transferred yet.

### 4:25-5:10 - Execute Atomic DvP

**Action:** Select Issuer and click **Execute atomic DvP**. Select Auditor. Show
the **Cash**, **Asset**, **Holding**, **Request**, and **Receipt** tabs.

**Say:**

> The issuer submits the final action. In this compact topology, the provider
> party supplies the required issuer and verifier authority. Inside one Daml
> transaction, Canton validates both allocations, transfers the Canton Coin,
> delivers the private-credit holding, consumes the agreement and both
> allocations, and creates this receipt. If any child operation had failed, none
> of these effects would have committed.

> The Cash and Asset allocations are archived, the investor's new Holding is
> active, and the auditor-visible Receipt references both allocations and the
> resulting holding. The balance evidence confirms the 10 Canton Coin movement,
> while the contract lifecycle is the authoritative settlement record.

## Segment B: Separate Authorization Run

Record this as a separate terminal clip. Do not imply that it is the browser
transaction from Segment A.

Run:

```bash
./scripts/localnet-demo.sh --interactive --show-negative
```

At the browser checkpoint, do not accept the request in the wallet. Return to
the terminal and press Enter. Start the usable clip when the negative check
appears.

### 5:10-5:45 - Show Ledger Authorization

**Screen:** Terminal output from **Negative check** through **Rejection was
atomic**.

**Say:**

> In a separate rehearsal run, the investor attempts the provider-controlled
> settlement action. Canton rejects it with a Daml authorization error. The
> runner then queries all four prerequisite contracts and confirms that the
> request, agreement, cash allocation, and asset allocation remain active. This
> permission is enforced by the ledger, not by hiding a button in the UI.

Allow the runner to finish, then briefly show **Atomic DvP settlement complete**
and **Request and allocations: consumed**.

## Segment C: Close

### 5:45-6:10 - Summarize Scope

**Screen:** Return to the completed Auditor view.

**Say:**

> This demonstrates a compliance-gated, two-asset settlement using real Daml
> authorization, the Canton Token Standard, an unmodified wallet, and Canton
> Coin contracts on Quickstart LocalNet. The demo deliberately simplifies the
> production topology: provider-side roles share one party, LocalNet Coin has no
> market value, and the private-credit token covers primary issuance rather than
> a complete secondary market.

> The same pattern can support other regulated assets, including private shares,
> where investor eligibility, asset control, payment, and delivery must be
> coordinated without exposing the complete transaction to the whole network.

## Claims Checklist

Use these phrases:

- "Canton Coin contracts on Quickstart LocalNet."
- "The official Quickstart wallet discovered our standard request."
- "Business authorization is enforced by Daml and Canton."
- "Both transfers commit together or neither commits."
- "Authorized parties verify their own ledger views."

Avoid these phrases:

- "This is running on Canton MainNet."
- "We built this Canton Coin wallet."
- "All five business roles run independent nodes in this LocalNet."
- "Every private workflow step is visible in a public block explorer."
- "This is a production-ready private-credit registry."

## Editing Notes

- Cut wallet login and service warm-up from the final video.
- Pause for one or two seconds after each status transition.
- Keep contract IDs visible as evidence, but do not read them aloud.
- Use a short title card only if needed; begin with the working application.
- If the wallet contains older requests, identify the current one by its asset
  ID and two named legs, or reset LocalNet intentionally before recording.
- If aggregate wallet balances are still indexing, rely on the archived
  allocations, active holding, and active receipt as authoritative evidence.
