# Local Runbook

## Prerequisites

- Linux or macOS shell.
- DPM with Daml SDK `3.5.2`.
- JDK 21.
- Docker Desktop or Docker Engine for the Quickstart path. WSL users must enable
  Docker Desktop integration for this distribution.

Verify:

```bash
dpm --version
java -version
```

On this workstation, the user-local JRE is at:

```text
~/.local/share/canton-jdk-21/usr/lib/jvm/java-21-openjdk-amd64
```

`scripts/test.sh` detects that location when `java` is not on `PATH`.

## Build And Test

From the repository root:

```bash
./scripts/test.sh
```

The script builds all four packages in dependency order, then executes both Daml
Script test packages. Expected result: 13 V1 and 8 tokenized DvP scripts report
`ok`.

Generated DARs:

```text
daml/model/.daml/dist/canton-regulated-settlement-model-0.1.0.dar
daml/tests/.daml/dist/canton-regulated-settlement-tests-0.1.0.dar
daml/tokenized-model/.daml/dist/canton-tokenized-settlement-model-0.3.0.dar
daml/tokenized-tests/.daml/dist/canton-tokenized-settlement-tests-0.3.0.dar
```

Only the two `*-model` DARs are intended for upload to a participant. The test
DARs include `daml-script` and test-only templates.

## Run One Script

```bash
cd daml/tests
dpm test -p setupRegulatedSettlementDemo
```

Useful focused patterns:

```bash
dpm test -p WithdrawnAttestation
dpm test -p PaymentCanOnlyBePreparedOnce
dpm test -p Bypass
```

Run the tokenized DvP demo or focused failure cases from its test package:

```bash
cd ../tokenized-tests
dpm test -p setupTokenizedPaymentDemo
dpm test -p MismatchedPayment
dpm test -p BrokenDelivery
dpm test -p WrongParty
```

## Quickstart LocalNet

Clone the official Quickstart beside this repository, configure it for LocalNet,
shared-secret auth, test mode, and no observability, then start it:

```bash
git clone https://github.com/digital-asset/cn-quickstart.git ../cn-quickstart
cd ../cn-quickstart/quickstart
env JAVA_HOME="$HOME/.local/share/canton-jdk-21/usr/lib/jvm/java-21-openjdk-amd64" \
  PATH="$HOME/.dpm/bin:$JAVA_HOME/bin:$PATH" \
  make start
```

Then run the real Canton Coin/private-credit DvP from this repository:

```bash
./scripts/localnet-demo.sh
```

The runner is repeatable. It uploads only production DARs, uses the current
tokenized model package ID, funds the LocalNet investor when necessary, creates
the custodian-controlled private-credit allocation, and prints the final DvP
receipt, both consumed allocations, investor holding, and before/after balances.

Presentation modes can be combined:

```bash
./scripts/localnet-demo.sh --interactive --show-negative
./scripts/localnet-demo.sh --show-negative --verbose
```

`--interactive` pauses at wallet discovery after the private-credit leg is
already reserved. `--show-negative` submits and verifies a real wrong-party
rejection before successful completion, including continued activeness of both
allocations. `--verbose` adds contract IDs and detailed errors. See the
[presenter guide](demo-guide.md) for the timed walkthrough.

Useful Quickstart endpoints are:

- Investor wallet: `http://wallet.localhost:2000`
- Provider wallet: `http://wallet.localhost:3000`
- Ledger API Swagger: `http://localhost:9090`

Stop the stack with `make stop` from the Quickstart directory.

## Common Failures

`java: command not found` means JDK 21 is missing or not discoverable. Use the
wrapper script or export `JAVA_HOME` and prepend `$JAVA_HOME/bin` to `PATH`.

An error loading `java.security` usually means a Debian/Ubuntu JRE package was
extracted without its `/etc/java-21-openjdk` configuration links. Prefer a normal
JDK installation or a complete Temurin archive on a clean machine.

If a test package cannot find a model DAR, run `dpm build --all` from `daml`;
the local `multi-package.yaml` establishes the build order.

If `docker` is unavailable inside WSL, enable Docker Desktop integration for the
distribution and reopen the shell. If `localnet-demo.sh` cannot find
`splice-onboarding`, start Quickstart first.
If a wallet request times out, check `docker ps` and wait until both `canton` and
`splice` are healthy before retrying.

The Token Standard API DARs are checked into `daml/vendor` so builds do not
depend on the sibling research repositories. Their origin, license, commit, and
checksums are recorded in [Third-Party Notices](../../THIRD_PARTY_NOTICES.md).
