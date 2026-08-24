# Canton Research Brief

Date: 2026-08-20

## Builder Path

The Canton Foundation onboarding path moves from local development to network
operations:

1. Install DPM and a compatible Daml SDK.
2. Build locally with Quickstart/LocalNet.
3. Choose self-hosting or a node-as-a-service provider.
4. Prepare network and identity infrastructure.
5. Obtain required sponsorship and onboarding material.
6. Progress through DevNet and later network environments.

The POC currently addresses the local Daml foundation. It does not yet prove
validator operation or network onboarding.

## Practical Stack

- DPM and Daml SDK `3.5.2` for the current official Quickstart snapshot.
- JDK 21 for Daml Script and Quickstart runtime components.
- Docker with at least 8 GB available for the full Quickstart/LocalNet stack.
- A backend using the Ledger API/JSON Ledger API for a browser application.
- Token-standard allocation APIs for genuine DvP.

## Why Canton Fits This Workflow

- Party-level privacy is part of the ledger model.
- Authorization is encoded by signatories and choice controllers.
- Independent institutions can contribute authority to one transaction flow.
- Token-standard allocations provide a path to atomic multi-asset settlement.
- Daml contracts give the UI and backend one shared workflow definition.

## Official Sources

- [Canton Network Quickstart](https://github.com/digital-asset/cn-quickstart)
- [Splice and Token Standard sources](https://github.com/canton-network/splice)
- [Canton Improvement Proposals](https://github.com/canton-foundation/cips)
- [Canton Development Fund](https://github.com/canton-foundation/canton-dev-fund)
- [Canton Foundation onboarding guide](https://guide.canton.foundation/)

These sources retain their own Git histories and are intentionally referenced
rather than copied into this repository.
