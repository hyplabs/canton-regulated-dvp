#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: ./scripts/localnet-demo.sh [options]

Runs one regulated private-credit settlement with real Canton Coin.

Options:
  --interactive    Pause after wallet discovery for browser inspection.
  --show-negative  Have the investor attempt settlement and prove rejection.
  --verbose        Print contract IDs and detailed rejection information.
  -h, --help       Show this help.
USAGE
}

interactive=false
show_negative=false
verbose=false

while (($# > 0)); do
  case "$1" in
    --interactive)
      interactive=true
      ;;
    --show-negative)
      show_negative=true
      ;;
    --verbose)
      verbose=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [[ "$interactive" == true && ! -t 0 ]]; then
  echo "--interactive requires a terminal so the demo can wait for Enter." >&2
  exit 2
fi

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
runtime_script="$repo_root/scripts/localnet-demo-runtime.sh"
model_dar=$(find "$repo_root/daml/model/.daml/dist" -maxdepth 1 \
  -name 'canton-regulated-settlement-model-*.dar' -print | sort -V | tail -n 1)
tokenized_dar=$(find "$repo_root/daml/tokenized-model/.daml/dist" -maxdepth 1 \
  -name 'canton-regulated-dvp-model-*.dar' -print | sort -V | tail -n 1)

if [[ -z "$model_dar" || -z "$tokenized_dar" ]]; then
  echo "Production DARs were not found. Run ./scripts/test.sh first." >&2
  exit 1
fi

if [[ ! -f "$runtime_script" ]]; then
  echo "LocalNet runtime helper was not found at $runtime_script." >&2
  exit 1
fi

if [[ $(docker inspect -f '{{.State.Running}}' splice-onboarding 2>/dev/null || true) != true ]]; then
  echo "Quickstart LocalNet is not running (missing splice-onboarding container)." >&2
  exit 1
fi

tokenized_package_id=$(
  unzip -Z1 "$tokenized_dar" |
    sed -nE 's#.*canton-regulated-dvp-model-[0-9.]+-([0-9a-f]{64})\.dalf$#\1#p' |
    head -n 1
)

if [[ -z "$tokenized_package_id" ]]; then
  echo "Could not determine the tokenized model package ID from $tokenized_dar." >&2
  exit 1
fi

model_name=$(basename "$model_dar")
tokenized_name=$(basename "$tokenized_dar")

echo "Preparing the regulated settlement packages..."
docker cp "$model_dar" "splice-onboarding:/tmp/$model_name" >/dev/null
docker cp "$tokenized_dar" "splice-onboarding:/tmp/$tokenized_name" >/dev/null
docker cp "$runtime_script" splice-onboarding:/tmp/localnet-demo-runtime.sh >/dev/null
docker exec \
  -e MODEL_DAR_NAME="$model_name" \
  -e TOKENIZED_DAR_NAME="$tokenized_name" \
  splice-onboarding bash -s <<'UPLOAD'
set -eo pipefail
DO_INIT=false
source /app/utils.sh
source /app/app-provider-auth.sh 2>/dev/null
for dar in "/tmp/$MODEL_DAR_NAME" "/tmp/$TOKENIZED_DAR_NAME"; do
  response=$(curl -sS -w $'\n%{http_code}' \
    "http://canton:3${PARTICIPANT_JSON_API_PORT_SUFFIX}/v2/dars?vetAllPackages=true" \
    -H "Authorization: Bearer $APP_PROVIDER_PARTICIPANT_ADMIN_TOKEN" \
    -H 'Content-Type: application/octet-stream' \
    --data-binary @"$dar")
  status=$(tail -n 1 <<<"$response")
  if [[ ! "$status" =~ ^2 ]]; then
    echo "Provider package upload failed with HTTP $status: $(sed '$d' <<<"$response")" >&2
    exit 1
  fi
done

source /app/app-user-auth.sh 2>/dev/null
for dar in "/tmp/$MODEL_DAR_NAME" "/tmp/$TOKENIZED_DAR_NAME"; do
  response=$(curl -sS -w $'\n%{http_code}' \
    "http://canton:2${PARTICIPANT_JSON_API_PORT_SUFFIX}/v2/dars?vetAllPackages=true" \
    -H "Authorization: Bearer $APP_USER_PARTICIPANT_ADMIN_TOKEN" \
    -H 'Content-Type: application/octet-stream' \
    --data-binary @"$dar")
  status=$(tail -n 1 <<<"$response")
  if [[ ! "$status" =~ ^2 ]]; then
    echo "Investor package upload failed with HTTP $status: $(sed '$d' <<<"$response")" >&2
    exit 1
  fi
done
UPLOAD

docker exec \
  -e TOKENIZED_PACKAGE_ID="$tokenized_package_id" \
  splice-onboarding bash -s <<'VERIFY'
set -eo pipefail
DO_INIT=false
source /app/utils.sh
source /app/app-provider-auth.sh 2>/dev/null
curl -fsS "http://canton:3${PARTICIPANT_JSON_API_PORT_SUFFIX}/v2/packages/$TOKENIZED_PACKAGE_ID" \
  -H "Authorization: Bearer $APP_PROVIDER_PARTICIPANT_ADMIN_TOKEN" >/dev/null
source /app/app-user-auth.sh 2>/dev/null
curl -fsS "http://canton:2${PARTICIPANT_JSON_API_PORT_SUFFIX}/v2/packages/$TOKENIZED_PACKAGE_ID" \
  -H "Authorization: Bearer $APP_USER_PARTICIPANT_ADMIN_TOKEN" >/dev/null
VERIFY

echo "Running the regulated Canton Coin settlement..."
docker exec -i \
  -e TOKENIZED_PACKAGE_ID="$tokenized_package_id" \
  -e DEMO_INTERACTIVE="$interactive" \
  -e DEMO_SHOW_NEGATIVE="$show_negative" \
  -e DEMO_VERBOSE="$verbose" \
  splice-onboarding bash /tmp/localnet-demo-runtime.sh
