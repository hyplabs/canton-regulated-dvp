# LocalNet Integration Milestone

Updated: 2026-08-24

## Topology

Quickstart provides separate app-provider and app-user participants. The
provider party fills issuer, verifier, custodian, and auditor roles; the user
party is the investor. This keeps wallet funding and completion demonstrable
without claiming five independently operated participants.

The earlier one-leg Canton Coin runner was verified twice on this topology. The
current code extends that path to full DvP; its post-change LocalNet rerun is
pending because Docker Desktop WSL integration is not currently exposed to this
shell.

## Runtime Path

1. Start `../resources/cn-quickstart/quickstart` with `make start`.
2. Run `./scripts/test.sh` to build and test all four Daml packages.
3. Run `./scripts/localnet-demo.sh --show-negative`.

The runner uploads both production DARs to both participants and obtains the
Quickstart parties and Canton Coin instrument admin. It then:

1. Creates eligibility, offer, compliance, and purchase-agreement contracts.
2. Accumulates issuer and verifier authority for the two-leg proposal.
3. Has the custodian reserve private-credit units in a production
   `PrivateCreditAllocation`.
4. Has the investor accept the request.
5. Waits for the standard wallet to discover `AllocationRequest`.
6. Uses the wallet API to create a real Canton Coin allocation for `payment`.
7. Gets Canton Coin execute-transfer context and disclosures from the registry.
8. Exercises `CompleteTokenizedDvP`, passing registry context for cash and empty
   standard context for the private-credit allocation.
9. Queries both allocations as archived, the investor holding as active, and the
   DvP receipt as active.
10. Compares investor and provider Canton Coin balances.

`--show-negative` first submits completion as the investor. Follow-up ledger
queries require the request, agreement, cash allocation, and asset allocation to
remain active before the authorized transaction proceeds.

## Standard Boundary

The wallet recognizes the app contract through `AllocationRequest` rather than
an app-specific template. The runner uses the wallet's `/v0/allocations`
endpoint for cash and the registry's transfer-context endpoint for execution.
No token-specific transfer command is embedded in the business workflow.

The private-credit side also implements the standard `Allocation` and `Holding`
interfaces, but it is a deliberately focused app-owned registry for primary
issuance. It does not need external choice context.

## Verification Status

- [x] Both production model DARs build and can be uploaded independently.
- [x] The standard wallet previously discovered the custom request on LocalNet.
- [x] A real Canton Coin allocation previously executed with registry context.
- [x] The current Daml suite proves matching two-leg execution.
- [x] The current Daml suite proves delivery failure rolls back payment.
- [x] The runner submits both allocation IDs to `CompleteTokenizedDvP`.
- [x] Node and browser tests cover both allocation and holding evidence.
- [ ] Rerun the current two-leg runner against Quickstart LocalNet.
- [ ] Repeat mismatch and expiry failures against the real Canton Coin registry.

## Historical Runtime Evidence

On 2026-08-21, before the asset leg was tokenized, two consecutive payment runs
completed. On the second run the investor moved from `19990.0000000000` to
`19980.0000000000` Amulet and the provider moved from `10.0000000000` to
`20.0000000000` Amulet. That evidence supports the unchanged wallet and registry
integration, but it is not presented as proof of the new two-leg code.
