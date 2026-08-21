# Local Runbook

## Prerequisites

- Linux or macOS shell.
- DPM with Daml SDK `3.5.2`.
- JDK 21.

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
Script test packages. Expected result: 13 V1 and 7 V2 scripts report `ok`.

Generated DARs:

```text
daml/model/.daml/dist/canton-regulated-settlement-model-0.1.0.dar
daml/tests/.daml/dist/canton-regulated-settlement-tests-0.1.0.dar
daml/tokenized-model/.daml/dist/canton-tokenized-settlement-model-0.1.0.dar
daml/tokenized-tests/.daml/dist/canton-tokenized-settlement-tests-0.1.0.dar
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

Run the tokenized demo or one V2 failure case from its test package:

```bash
cd ../tokenized-tests
dpm test -p setupTokenizedPaymentDemo
dpm test -p MismatchedAllocation
```

## Common Failures

`java: command not found` means JDK 21 is missing or not discoverable. Use the
wrapper script or export `JAVA_HOME` and prepend `$JAVA_HOME/bin` to `PATH`.

An error loading `java.security` usually means a Debian/Ubuntu JRE package was
extracted without its `/etc/java-21-openjdk` configuration links. Prefer a normal
JDK installation or a complete Temurin archive on a clean machine.

If a test package cannot find a model DAR, run `dpm build --all` from `daml`;
the local `multi-package.yaml` establishes the build order.

The Token Standard API DARs are checked into `daml/vendor` so builds do not
depend on the sibling research repositories. Their origin, license, commit, and
checksums are recorded in `THIRD_PARTY_NOTICES.md`.
