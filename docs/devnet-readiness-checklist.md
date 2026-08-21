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
- [ ] Capture representative LocalNet logs as release evidence.

## Token Standard

- [x] Define the payment instrument ID; asset instrument remains open.
- [x] Map payment settlement to an allocation request and transfer leg.
- [x] Validate payment allocations against exact leg and settlement data.
- [x] Execute payment allocation atomically with workflow advancement.
- [ ] Execute payment and delivery atomically.
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
- [ ] Publish build and test output.
- [ ] Record the stakeholder walkthrough.
- [x] Document known V1 and current V2 limitations.
