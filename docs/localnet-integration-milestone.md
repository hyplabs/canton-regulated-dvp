# LocalNet Integration Milestone

Date: 2026-08-21

## Readiness Snapshot

| Prerequisite | Local status |
| --- | --- |
| Docker client | `29.6.1`, meets Quickstart minimum `27.0.0` |
| Docker Compose | `5.1.4`, meets Quickstart minimum `2.27.0` |
| Docker daemon | Not reachable at `/var/run/docker.sock` |
| Memory | 7.7 GiB visible, effectively the 8 GB recommended minimum |
| Free disk | About 819 GiB |
| Daml SDK | `3.5.2`, aligned with Quickstart |

The first runtime attempt is blocked only on starting or connecting the Docker
daemon. At this memory tier, use shared-secret authentication and disable
observability for the initial path.

## Runtime Path

Once Docker is reachable:

1. Run `make check-docker` in `../resources/cn-quickstart/quickstart`.
2. Run `make setup`; select LocalNet, shared-secret authentication,
   observability off, and test mode on.
3. Run `./scripts/test.sh` here to build the two production DARs.
4. Make both production DARs available under `/canton/dars` in Quickstart's
   `splice-onboarding` container before startup.
5. Start Quickstart with `make start`. Its onboarding helper uploads every DAR
   in that directory to both app participants using `POST /v2/packages`.
6. Use the registry metadata API to obtain the instrument admin and construct
   `InstrumentId { admin, id = "Amulet" }` for Canton Coin.
7. Create the regulated agreement and `TokenizedPaymentRequest` through the
   Ledger API.
8. Confirm the investor wallet discovers the request through the standard
   `AllocationRequest` interface, then fund it through
   `AllocationFactory_Allocate`.
9. Query the resulting `Allocation` by the request's settlement reference.
10. Fetch its execute-transfer choice context from the registry's off-ledger
    allocation API and submit `CompleteTokenizedPayment` with the returned
    disclosures and `ExtraArgs`.
11. Confirm the allocation is consumed and `PaymentPrepared` is active, then
    complete delivery and final settlement.

## Code Reuse From Quickstart

The reference flow already demonstrates each off-ledger operation:

- `TokenStandardProxy.getRegistryAdminId()` discovers the instrument admin.
- `TokenStandardProxy.getAllocationTransferContext()` retrieves registry choice
  context and disclosed contracts.
- `DamlRepository` joins an allocation to a request by settlement reference.
- `LicenseApiImpl.completeLicenseRenewal()` builds `ExtraArgs` and submits the
  business choice with disclosures.

Our backend adapter should follow those patterns and substitute generated Java
bindings for `TokenizedPaymentRequest` and `CompleteTokenizedPayment`. It should
not invent a token-specific transfer command.

## Done Criteria

- Both POC model DARs are visible on the app-provider and app-user participants.
- The wallet discovers the payment request without app-specific request parsing.
- A real Canton Coin allocation is created and found by settlement reference.
- `CompleteTokenizedPayment` succeeds with registry-provided choice context.
- Balances and active contracts prove the transfer and workflow transition.
- The inactive, mismatched, and expired allocation cases are repeated against
  the real registry.

The second delivery allocation is a separate milestone. Until both legs execute
in one transaction, the demo remains token-standard payment plus regulated
delivery workflow, not full DvP.
