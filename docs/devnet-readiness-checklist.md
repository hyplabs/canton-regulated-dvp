# Canton Readiness Checklist

Date: 2026-08-20

## Local Daml Foundation

- [x] Install DPM and Daml SDK.
- [x] Align with SDK `3.5.2` used by the Quickstart snapshot.
- [x] Separate uploadable model and script/test packages.
- [x] Build both DARs locally.
- [x] Execute happy and negative Daml scripts.
- [x] Document contract authority and visibility.
- [ ] Verify setup from a clean second machine or CI runner.

## Canton Runtime

- [ ] Start Canton Quickstart/LocalNet.
- [ ] Upload the model DAR to the local participant.
- [ ] Allocate/map application parties.
- [ ] Exercise the workflow through Ledger API commands.
- [ ] Capture LocalNet logs and a repeatable teardown procedure.

## Token Standard

- [ ] Define payment and asset instrument IDs.
- [ ] Map settlement to allocation requests and transfer legs.
- [ ] Validate allocations against the settlement reference and deadline.
- [ ] Execute payment and delivery atomically.
- [ ] Add failure tests for missing, mismatched, and expired allocations.

## DevNet Operations

- [ ] Choose self-hosted or node-as-a-service deployment.
- [ ] Provision required static outbound networking.
- [ ] Define service identities, OIDC/OAuth, and credential rotation.
- [ ] Identify the required sponsor and onboarding contacts.
- [ ] Prepare whitelist and secret-handling procedures.
- [ ] Record DevNet/TestNet/MainNet assumptions separately.

## Release Evidence

- [ ] Tag a reviewed demo commit.
- [ ] Publish build and test output.
- [ ] Record the stakeholder walkthrough.
- [ ] Document known V1 limitations and V2 owners.
