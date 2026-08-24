# Canton Readiness Checklist

Date: 2026-08-20

## Local Daml Foundation

- [x] Install DPM and Daml SDK.
- [x] Align with SDK `3.5.2` used by the Quickstart snapshot.
- [x] Separate uploadable model and script/test packages.
- [x] Build both production and both test DARs locally.
- [x] Execute happy and negative Daml scripts.
- [x] Document contract authority and visibility.
- [x] Add a pinned GitHub Actions build and test workflow.
- [ ] Verify setup from a clean second machine or CI runner.

## Canton Runtime

- [x] Verify Docker and host resource prerequisites.
- [x] Start or connect the Docker daemon on this workstation.
- [x] Start Canton Quickstart/LocalNet.
- [x] Upload both model DARs to both local application participants.
- [x] Allocate/map application parties.
- [x] Exercise the workflow through Ledger API commands.
- [x] Execute a real Canton Coin allocation through the wallet and registry.
- [x] Add a repeatable LocalNet demo runner.
- [x] Document a repeatable teardown procedure.
- [x] Capture representative LocalNet rehearsal evidence.

## Token Standard

- [x] Define payment and private-credit instrument IDs.
- [x] Map payment settlement to an allocation request and transfer leg.
- [x] Validate payment allocations against exact leg and settlement data.
- [x] Execute payment allocation atomically with workflow advancement.
- [x] Execute payment and delivery atomically in Daml tests and app wiring.
- [ ] Reverify atomic payment and delivery against Quickstart LocalNet.
- [x] Add local failure tests for mismatched, inactive, and expired allocations.
- [ ] Repeat allocation failure coverage against the LocalNet registry.

## DevNet Operations

- [ ] Choose self-hosted or node-as-a-service deployment.
- [ ] Provision required static outbound networking.
- [ ] Define service identities, OIDC/OAuth, and credential rotation.
- [ ] Identify the required sponsor and onboarding contacts.
- [ ] Prepare whitelist and secret-handling procedures.
- [ ] Record DevNet/TestNet/MainNet assumptions separately.

## Release Evidence

- [ ] Tag a reviewed demo commit.
- [x] Record current build and test results plus historical one-leg LocalNet
  evidence.
- [ ] Record a current full-DvP LocalNet rehearsal.
- [ ] Record the stakeholder walkthrough.
- [x] Document known V1, current DvP, and runtime-verification limitations.
