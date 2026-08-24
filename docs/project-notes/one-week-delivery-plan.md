# Delivery Plan

Date range: 2026-08-20 to 2026-08-27

## Completed

- Researched Canton onboarding, Quickstart, token-standard, CIPs, and Development
  Fund references.
- Selected a regulated-settlement use case.
- Implemented a compliance-gated Daml state machine.
- Added active attestation and deadline enforcement.
- Prevented duplicate lifecycle transitions.
- Accumulated verifier and custodian authority in settlement state.
- Split production and test packages.
- Provisioned JDK 21 and executed 13 passing scripts.
- Created a companion Daml learning guide.
- Moved the POC into its own Git repository.
- Added pinned Token Standard API DARs and an `AllocationRequest` implementation.
- Atomically execute a matching payment `Allocation` before workflow advance.
- Added eight passing tokenized DvP scripts and expanded the learning guide.
- Added a reproducible GitHub Actions workflow.
- Started Quickstart LocalNet and uploaded both production model DARs to both
  application participants.
- Executed a real Canton Coin allocation and regulated settlement end to end.
- Added a repeatable JSON Ledger API LocalNet runner with balance and active-state
  verification.
- Added the first stakeholder UI slice backed by a real eligibility contract.
- Added Node and Playwright coverage for the backend mapping and browser states.
- Extended the UI through issuer offer creation and investor acceptance using
  separate LocalNet participants.
- Added verifier compliance approval and active purchase-agreement evidence.
- Added three-party tokenized payment authorization and wallet discovery to the
  stakeholder UI.
- Added real Canton Coin allocation and allocation-contract evidence to the
  stakeholder UI.
- Added registry-backed atomic payment execution, consumed-contract evidence,
  and wallet balance verification to the stakeholder UI.
- Added standard private-credit holding and allocation contracts.
- Added custodian reservation of the delivery leg before investor acceptance.
- Added `CompleteTokenizedDvP`, which executes cash and asset allocations in one
  transaction and records the resulting investor holding.
- Added a rollback test proving delivery failure leaves the payment allocation
  active and commits no payment receipt.
- Replaced the V1 delivery-evidence UI path with cash allocation, asset
  allocation, holding, and DvP receipt evidence.

## Next: Runtime Evidence

1. Rerun the full two-leg driver on Quickstart LocalNet.
2. Add missing-allocation and expired-allocation real-registry tests.
3. Capture representative full-DvP LocalNet logs as release evidence.

## V3 Presentation Slice

1. Completed: add a backend that submits verifier commands without exposing
   participant tokens to the browser.
2. Completed: extend the role-based workflow UI through
   `TokenizedSettlementReceipt`.
3. Next: add a visible negative-path scenario to the UI.
4. Capture a three-to-five-minute walkthrough.

## Exit Criteria

- A new developer can run V1 from the README.
- The UI state corresponds to active ledger contracts.
- At least one LocalNet path is demonstrated end to end.
- A successful LocalNet DvP run is claimed only after both token allocations are
  observed executing atomically on that runtime.
