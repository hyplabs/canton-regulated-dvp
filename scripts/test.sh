#!/usr/bin/env bash

set -euo pipefail

canton_repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

if command -v dpm >/dev/null 2>&1; then
  canton_dpm_bin=$(command -v dpm)
elif test -x "$HOME/.dpm/bin/dpm"; then
  canton_dpm_bin="$HOME/.dpm/bin/dpm"
else
  echo "DPM was not found. Install it from https://get.digitalasset.com/." >&2
  exit 1
fi

if command -v java >/dev/null 2>&1; then
  canton_java_bin=$(command -v java)
elif test -x "$HOME/.local/share/canton-jdk-21/usr/lib/jvm/java-21-openjdk-amd64/bin/java"; then
  canton_java_bin="$HOME/.local/share/canton-jdk-21/usr/lib/jvm/java-21-openjdk-amd64/bin/java"
else
  echo "Java was not found. Install or provision JDK 21 before running tests." >&2
  exit 1
fi

export JAVA_HOME
JAVA_HOME=$(cd "$(dirname "$canton_java_bin")/.." && pwd)
export PATH="$JAVA_HOME/bin:$PATH"

cd "$canton_repo_root/daml/tests"
"$canton_dpm_bin" build
"$canton_dpm_bin" test --show-coverage "$@"
