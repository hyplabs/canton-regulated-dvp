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
- Added seven passing V2 scripts and expanded the learning guide.
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

## Next: Complete V2

1. Model the second asset leg and atomic DvP transaction.
2. Add missing-allocation and expired-allocation runtime tests.
3. Capture representative LocalNet logs as release evidence.

## In Progress: V3 Presentation Slice

1. Completed: add a backend that submits verifier commands without exposing
   participant tokens to the browser.
2. In progress: extend the role-based workflow UI one ledger transition at a
   time; the real Canton Coin allocation is now reached.
3. Demonstrate successful settlement and withdrawn-eligibility failure.
4. Capture a three-to-five-minute walkthrough.

## Exit Criteria

- A new developer can run V1 from the README.
- The UI state corresponds to active ledger contracts.
- At least one LocalNet path is demonstrated end to end.
- DvP is claimed only after token allocations execute atomically.
