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

## Next: V2 Runtime Slice

1. Start Quickstart/LocalNet and upload both production model DARs.
2. Replace `MockAllocation` with one real registry-funded payment allocation.
3. Reproduce the happy path through Ledger API commands.
4. Model the second asset leg and atomic DvP transaction.
5. Add missing-allocation and expired-allocation runtime tests.

## Then: V3 Presentation Slice

1. Add a small backend that submits commands for authorized roles.
2. Build the role-based workflow UI against that backend.
3. Demonstrate successful settlement and withdrawn-eligibility failure.
4. Capture a three-to-five-minute walkthrough.

## Exit Criteria

- A new developer can run V1 from the README.
- The UI state corresponds to active ledger contracts.
- At least one LocalNet path is demonstrated end to end.
- DvP is claimed only after token allocations execute atomically.
