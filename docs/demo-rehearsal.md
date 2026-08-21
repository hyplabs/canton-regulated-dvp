# LocalNet Demo Rehearsal

Date: 2026-08-21

This records a stopped-stack rehearsal of the regulated Canton Coin demo. It is
release evidence for the current POC, not a performance benchmark for Canton or
production infrastructure.

## Environment

- Canton Network Quickstart LocalNet running through Docker Desktop on WSL.
- Docker `29.6.1` and Docker Compose `5.3.0`.
- Daml SDK `3.5.2` and JDK 21.
- Approximately 7.7 GiB of memory available to the WSL environment.
- Existing Docker images and LocalNet volumes retained; no image pull or clean
  state bootstrap was included.

## Procedure And Results

1. Stopped Quickstart with `make stop`, preserving the LocalNet volumes.
2. Ran `./scripts/test.sh`: all 13 V1 and 7 V2 scripts passed in 51.17 seconds.
3. Ran `make start`: cached build, container startup, core health checks, and
   participant onboarding completed in 364.87 seconds.
4. Ran `./scripts/localnet-demo.sh --show-negative`: the complete workflow
   passed in 53.84 seconds.

Quickstart's `register-app-user-tenant` helper exited successfully with code 0
after registration. Its final Docker health label remained `unhealthy` because
it is a short-lived one-shot container; `canton`, `splice`,
`splice-onboarding`, PostgreSQL, and all three wallet services were healthy.

## Ledger Evidence

The investor attempted the provider-controlled `CompleteTokenizedPayment`
choice. Canton rejected the command with `DAML_AUTHORIZATION_ERROR`. Follow-up
Ledger API queries confirmed that the payment request, purchase agreement, and
Canton Coin allocation were still active, demonstrating atomic rejection.

The provider then completed the authorized path. The observed result was:

```text
Private-credit units:  1000
Canton Coin payment:   10.0 Amulet
Investor balance:      23040.1600000000 -> 23030.1600000000 Amulet
Provider balance:      3120.1600000000 -> 3130.1600000000 Amulet
Request and allocation: consumed
```

The separate `--interactive` mode was also exercised successfully. It paused
after the standard wallet discovered the custom allocation request and resumed
after presenter input.

## Presenter Recommendation

Start Quickstart at least ten minutes before a meeting, confirm the core
services are healthy, and then use:

```bash
./scripts/localnet-demo.sh --interactive --show-negative
```

The 53.84-second automated runtime leaves enough room for wallet inspection and
explanation in the five-minute presentation path. Starting from a stopped stack
is repeatable, but the six-minute cached startup should not be performed live.

## Scope Notes

- Docker state persisted from earlier runs, so starting balances were not zero.
- The rehearsal used LocalNet shared-secret authentication and faucet-funded
  Canton Coin.
- Delivery remains custodian evidence rather than a tokenized asset leg.
- A clean-machine or clean-volume rehearsal remains outstanding.
