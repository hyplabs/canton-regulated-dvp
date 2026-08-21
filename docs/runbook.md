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

The script builds the model DAR first, then the test DAR, then executes all Daml
Script declarations. Expected result: 13 scripts report `ok`.

Generated DARs:

```text
daml/model/.daml/dist/canton-regulated-settlement-model-0.1.0.dar
daml/tests/.daml/dist/canton-regulated-settlement-tests-0.1.0.dar
```

Only the model DAR is intended for upload to a participant.

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

## Common Failures

`java: command not found` means JDK 21 is missing or not discoverable. Use the
wrapper script or export `JAVA_HOME` and prepend `$JAVA_HOME/bin` to `PATH`.

An error loading `java.security` usually means a Debian/Ubuntu JRE package was
extracted without its `/etc/java-21-openjdk` configuration links. Prefer a normal
JDK installation or a complete Temurin archive on a clean machine.

If the test package cannot find the model DAR, run `dpm build` from
`daml/tests`; the parent `multi-package.yaml` establishes the build order.
