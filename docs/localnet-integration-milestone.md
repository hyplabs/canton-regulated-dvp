# LocalNet Integration Milestone

Date: 2026-08-21

## Readiness Snapshot

| Prerequisite | Local status |
| --- | --- |
| Docker client | `29.6.1`, meets Quickstart minimum `27.0.0` |
| Docker Compose | `5.3.0`, meets Quickstart minimum `2.27.0` |
| Docker daemon | Reachable through Docker Desktop WSL integration |
| Memory | 7.7 GiB visible, effectively the 8 GB recommended minimum |
| Free disk | About 819 GiB |
| Daml SDK | `3.5.2`, aligned with Quickstart |

Quickstart is configured with shared-secret authentication, observability off,
and test mode on. Canton, Splice, PostgreSQL, wallet UIs, and onboarding all
reached healthy status.

The minimal topology has two application parties. The app-provider party fills
the issuer, verifier, custodian, and auditor roles; the app-user party is the
investor. This keeps wallet funding and completion demonstrable without claiming
that the run proves five independently operated participants.

## Runtime Path

1. Run `make check-docker` in `../resources/cn-quickstart/quickstart`.
2. Run `make setup`; select LocalNet, shared-secret authentication,
   observability off, and test mode on.
3. Start Quickstart with `make start`.
4. Run `./scripts/test.sh` here to build and test all four Daml packages.
5. Run `./scripts/localnet-demo.sh`.

The demo runner uploads the latest production DARs to both participants, obtains
the Quickstart parties and Canton Coin admin, and submits each business action
through the owning participant's JSON Ledger API. The investor wallet discovers
the resulting `AllocationRequest`, funds it with its `/v0/allocations` endpoint,
and returns a real `AmuletAllocation` contract.

The runner then retrieves execute-transfer context and disclosures from the
registry off-ledger API, submits `CompleteTokenizedPayment`, and completes the
delivery and receipt states. It finishes by checking both wallet balances and
proving the allocation request and allocation were consumed.

Stop the stack from the Quickstart directory with:

```bash
make stop
```

Use `make clean` only when a fresh LocalNet ledger and wallet state are desired.

## Verified Result

Two consecutive runs completed successfully. On the repeatability run:

- Investor balance changed from `19990.0000000000` to `19980.0000000000`
  Amulet.
- Provider balance changed from `10.0000000000` to `20.0000000000` Amulet.
- The wallet reported zero active instances of that allocation request and
  allocation after settlement.
- Canton created a final `SettlementReceipt` retaining the payment and delivery
  references.

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

- [x] Both POC model DARs are visible on both application participants.
- [x] The wallet discovers the request without app-specific request parsing.
- [x] A real Canton Coin allocation is created for the settlement reference.
- [x] `CompleteTokenizedPayment` succeeds with registry-provided context.
- [x] Balances and active state prove the transfer and workflow transition.
- [ ] The inactive, mismatched, and expired allocation cases are repeated against
  the real registry.

The second delivery allocation is a separate milestone. Until both legs execute
in one transaction, the demo remains token-standard payment plus regulated
delivery workflow, not full DvP.
