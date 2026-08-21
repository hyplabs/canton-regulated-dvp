#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
model_dar=$(find "$repo_root/daml/model/.daml/dist" -maxdepth 1 \
  -name 'canton-regulated-settlement-model-*.dar' -print | sort -V | tail -n 1)
tokenized_dar=$(find "$repo_root/daml/tokenized-model/.daml/dist" -maxdepth 1 \
  -name 'canton-tokenized-settlement-model-*.dar' -print | sort -V | tail -n 1)

if [[ -z "$model_dar" || -z "$tokenized_dar" ]]; then
  echo "Production DARs were not found. Run ./scripts/test.sh first." >&2
  exit 1
fi

if [[ $(docker inspect -f '{{.State.Running}}' splice-onboarding 2>/dev/null || true) != true ]]; then
  echo "Quickstart LocalNet is not running (missing splice-onboarding container)." >&2
  exit 1
fi

tokenized_package_id=$(
  unzip -Z1 "$tokenized_dar" |
    sed -nE 's#.*canton-tokenized-settlement-model-[0-9.]+-([0-9a-f]{64})\.dalf$#\1#p' |
    head -n 1
)

if [[ -z "$tokenized_package_id" ]]; then
  echo "Could not determine the tokenized model package ID from $tokenized_dar." >&2
  exit 1
fi

model_name=$(basename "$model_dar")
tokenized_name=$(basename "$tokenized_dar")

echo "Uploading production DARs to both application participants..."
docker cp "$model_dar" "splice-onboarding:/tmp/$model_name"
docker cp "$tokenized_dar" "splice-onboarding:/tmp/$tokenized_name"
docker exec \
  -e MODEL_DAR_NAME="$model_name" \
  -e TOKENIZED_DAR_NAME="$tokenized_name" \
  splice-onboarding bash -s <<'UPLOAD'
set -eo pipefail
DO_INIT=false
source /app/utils.sh
source /app/app-provider-auth.sh 2>/dev/null
for dar in "/tmp/$MODEL_DAR_NAME" "/tmp/$TOKENIZED_DAR_NAME"; do
  curl -fsS "http://canton:3${PARTICIPANT_JSON_API_PORT_SUFFIX}/v2/packages" \
    -H "Authorization: Bearer $APP_PROVIDER_PARTICIPANT_ADMIN_TOKEN" \
    -H 'Content-Type: application/octet-stream' \
    --data-binary @"$dar" >/dev/null
done

source /app/app-user-auth.sh 2>/dev/null
for dar in "/tmp/$MODEL_DAR_NAME" "/tmp/$TOKENIZED_DAR_NAME"; do
  curl -fsS "http://canton:2${PARTICIPANT_JSON_API_PORT_SUFFIX}/v2/packages" \
    -H "Authorization: Bearer $APP_USER_PARTICIPANT_ADMIN_TOKEN" \
    -H 'Content-Type: application/octet-stream' \
    --data-binary @"$dar" >/dev/null
done
UPLOAD

echo "Running the regulated Canton Coin settlement..."
docker exec -i \
  -e TOKENIZED_PACKAGE_ID="$tokenized_package_id" \
  splice-onboarding bash -s <<'DEMO'
set -eo pipefail
DO_INIT=false
source /app/utils.sh
source /app/app-provider-auth.sh 2>/dev/null
provider_token=$APP_PROVIDER_PARTICIPANT_ADMIN_TOKEN
provider_party=$APP_PROVIDER_PARTY
provider_wallet_token=$(generate_jwt \
  "$AUTH_APP_PROVIDER_WALLET_ADMIN_USER_NAME" "$AUTH_APP_PROVIDER_AUDIENCE")

source /app/app-user-auth.sh 2>/dev/null
user_token=$APP_USER_PARTICIPANT_ADMIN_TOKEN
user_wallet_token=$APP_USER_WALLET_ADMIN_TOKEN
user_party=$APP_USER_PARTY
dso_party=$DSO_PARTY
set -u

payment_amount=${PAYMENT_AMOUNT:-10.0}
asset_units=${ASSET_UNITS:-1000}
v1='#canton-regulated-settlement-model:Settlement.Regulated'
v2="$TOKENIZED_PACKAGE_ID:Settlement.TokenizedPayment"
provider_ledger='http://canton:3975'
user_ledger='http://canton:2975'
provider_validator="http://splice:3${VALIDATOR_ADMIN_API_PORT_SUFFIX}/api/validator"
user_validator="http://splice:2${VALIDATOR_ADMIN_API_PORT_SUFFIX}/api/validator"
registry='http://splice:5012'

http_json() {
  local method=$1 url=$2 token=$3 body=${4:-}
  local args=(-sS -w $'\n%{http_code}' -X "$method" "$url")
  if [[ -n "$token" ]]; then
    args+=(-H "Authorization: Bearer $token")
  fi
  if [[ -n "$body" ]]; then
    args+=(-H 'Content-Type: application/json' --data-raw "$body")
  fi

  local response status response_body
  response=$(curl "${args[@]}")
  status=$(tail -n 1 <<<"$response")
  response_body=$(sed '$d' <<<"$response")
  if [[ ! "$status" =~ ^2 ]]; then
    echo "HTTP $status from $url" >&2
    echo "$response_body" >&2
    return 1
  fi
  printf '%s' "$response_body"
}

submit_command() {
  local ledger=$1 token=$2 actor=$3 command_name=$4 command=$5
  local disclosures=${6:-[]}
  local body
  body=$(jq -nc \
    --argjson command "$command" \
    --argjson disclosures "$disclosures" \
    --arg actor "$actor" \
    --arg command_id "$command_name-$(date +%s)-$RANDOM" \
    '{commands:{commands:[$command],commandId:$command_id,
      actAs:[$actor],readAs:[$actor],deduplicationPeriod:{Empty:{}},
      disclosedContracts:$disclosures}}')
  http_json POST "$ledger/v2/commands/submit-and-wait-for-transaction" \
    "$token" "$body"
}

created_cid() {
  local response=$1 template_suffix=$2 cid
  cid=$(jq -r --arg suffix "$template_suffix" \
    '.transaction.events[] | .CreatedEvent? | select(. != null) |
      select(.templateId | endswith($suffix)) | .contractId' \
    <<<"$response" | tail -n 1)
  if [[ -z "$cid" || "$cid" == null ]]; then
    echo "Expected a created $template_suffix contract." >&2
    return 1
  fi
  printf '%s' "$cid"
}

balance() {
  local validator=$1 token=$2
  http_json GET "$validator/v0/wallet/balance" "$token" |
    jq -r .effective_unlocked_qty
}

user_balance_json=$(http_json GET "$user_validator/v0/wallet/balance" "$user_wallet_token")
if ! jq -e --arg amount "$payment_amount" \
  '(.effective_unlocked_qty | tonumber) >= ($amount | tonumber)' \
  <<<"$user_balance_json" >/dev/null; then
  tap_body=$(jq -nc --arg id "regulated-demo-tap-$(date +%s)-$RANDOM" \
    '{amount:"1.0",command_id:$id}')
  http_json POST "$user_validator/v0/wallet/tap" \
    "$user_wallet_token" "$tap_body" >/dev/null
fi

user_balance_before=$(balance "$user_validator" "$user_wallet_token")
provider_balance_before=$(balance "$provider_validator" "$provider_wallet_token")

run_id="regulated-$(date +%s)-$RANDOM"
now_epoch=$(date +%s)
requested_at=$(date -u -d "@$now_epoch" +%Y-%m-%dT%H:%M:%SZ)
offer_expires=$(date -u -d "@$((now_epoch + 1800))" +%Y-%m-%dT%H:%M:%SZ)
allocate_before=$(date -u -d "@$((now_epoch + 3600))" +%Y-%m-%dT%H:%M:%SZ)
settle_before=$(date -u -d "@$((now_epoch + 7200))" +%Y-%m-%dT%H:%M:%SZ)
attestation_expires=$(date -u -d "@$((now_epoch + 10800))" +%Y-%m-%dT%H:%M:%SZ)

terms=$(jq -nc \
  --arg issuer "$provider_party" \
  --arg investor "$user_party" \
  --arg provider "$provider_party" \
  --arg units "$asset_units" \
  --arg amount "$payment_amount" \
  '{issuer:$issuer,investor:$investor,verifier:$provider,
    custodian:$provider,auditor:$provider,assetId:"PC-NOTE-LOCALNET",
    assetClass:"PRIVATE-CREDIT",units:$units,paymentAmount:$amount,
    paymentInstrumentId:"Amulet"}')
instrument=$(jq -nc --arg admin "$dso_party" '{admin:$admin,id:"Amulet"}')

args=$(jq -nc \
  --arg verifier "$provider_party" \
  --arg investor "$user_party" \
  --arg expires "$attestation_expires" \
  '{verifier:$verifier,investor:$investor,assetClass:"PRIVATE-CREDIT",
    expiresAt:$expires}')
command=$(jq -nc --arg template "$v1:EligibilityAttestation" \
  --argjson args "$args" \
  '{CreateCommand:{templateId:$template,createArguments:$args}}')
response=$(submit_command "$provider_ledger" "$provider_token" "$provider_party" \
  "$run_id-attestation" "$command")
attestation_cid=$(created_cid "$response" ':Settlement.Regulated:EligibilityAttestation')
echo "  1/10 Eligibility attested"

args=$(jq -nc --argjson terms "$terms" \
  --arg offer "$offer_expires" --arg settle "$settle_before" \
  '{terms:$terms,offerExpiresAt:$offer,settleBefore:$settle}')
command=$(jq -nc --arg template "$v1:AssetOffer" --argjson args "$args" \
  '{CreateCommand:{templateId:$template,createArguments:$args}}')
response=$(submit_command "$provider_ledger" "$provider_token" "$provider_party" \
  "$run_id-offer" "$command")
offer_cid=$(created_cid "$response" ':Settlement.Regulated:AssetOffer')
echo "  2/10 Asset offered"

choice_args=$(jq -nc --arg cid "$attestation_cid" \
  '{eligibilityAttestationCid:$cid}')
command=$(jq -nc --arg template "$v1:AssetOffer" --arg cid "$offer_cid" \
  --argjson args "$choice_args" \
  '{ExerciseCommand:{templateId:$template,contractId:$cid,
    choice:"AcceptOffer",choiceArgument:$args}}')
response=$(submit_command "$user_ledger" "$user_token" "$user_party" \
  "$run_id-accept-offer" "$command")
pending_cid=$(created_cid "$response" ':Settlement.Regulated:CompliancePending')
echo "  3/10 Offer accepted by investor"

command=$(jq -nc --arg template "$v1:CompliancePending" --arg cid "$pending_cid" \
  '{ExerciseCommand:{templateId:$template,contractId:$cid,
    choice:"ApproveCompliance",choiceArgument:{}}}')
response=$(submit_command "$provider_ledger" "$provider_token" "$provider_party" \
  "$run_id-approve-compliance" "$command")
agreement_cid=$(created_cid "$response" ':Settlement.Regulated:PurchaseAgreement')
echo "  4/10 Compliance approved"

args=$(jq -nc \
  --arg request "$run_id-payment" \
  --argjson terms "$terms" \
  --arg agreement "$agreement_cid" \
  --arg attestation "$attestation_cid" \
  --argjson instrument "$instrument" \
  --arg requested "$requested_at" \
  --arg allocate "$allocate_before" \
  --arg settle "$settle_before" \
  '{requestId:$request,terms:$terms,agreementCid:$agreement,
    eligibilityAttestationCid:$attestation,paymentInstrumentId:$instrument,
    requestedAt:$requested,allocateBefore:$allocate,settleBefore:$settle}')
command=$(jq -nc --arg template "$v2:TokenizedPaymentProposal" \
  --argjson args "$args" \
  '{CreateCommand:{templateId:$template,createArguments:$args}}')
response=$(submit_command "$provider_ledger" "$provider_token" "$provider_party" \
  "$run_id-propose-payment" "$command")
proposal_cid=$(created_cid "$response" \
  ':Settlement.TokenizedPayment:TokenizedPaymentProposal')

command=$(jq -nc --arg template "$v2:TokenizedPaymentProposal" \
  --arg cid "$proposal_cid" \
  '{ExerciseCommand:{templateId:$template,contractId:$cid,
    choice:"ApproveTokenizedPayment",choiceArgument:{}}}')
response=$(submit_command "$provider_ledger" "$provider_token" "$provider_party" \
  "$run_id-approve-payment" "$command")
approved_cid=$(created_cid "$response" \
  ':Settlement.TokenizedPayment:ApprovedTokenizedPayment')

command=$(jq -nc --arg template "$v2:ApprovedTokenizedPayment" \
  --arg cid "$approved_cid" \
  '{ExerciseCommand:{templateId:$template,contractId:$cid,
    choice:"AcceptTokenizedPayment",choiceArgument:{}}}')
response=$(submit_command "$user_ledger" "$user_token" "$user_party" \
  "$run_id-accept-payment" "$command")
request_cid=$(created_cid "$response" \
  ':Settlement.TokenizedPayment:TokenizedPaymentRequest')
echo "  5/10 Payment request authorized by all parties"

sleep 1
requests=$(http_json GET \
  "$user_validator/v0/wallet/token-standard/allocation-requests" \
  "$user_wallet_token")
request=$(jq -c --arg cid "$request_cid" \
  '.allocation_requests[] | select(.contract.contract_id == $cid)' <<<"$requests")
if [[ -z "$request" ]]; then
  echo "Wallet did not discover allocation request $request_cid." >&2
  exit 1
fi
echo "  6/10 Wallet discovered the standard AllocationRequest"

allocation_body=$(jq -nc --argjson request "$request" '
  $request.contract.payload as $payload |
  $payload.transferLegs.payment as $leg |
  {
    settlement: {
      executor: $payload.settlement.executor,
      settlement_ref: {
        id: $payload.settlement.settlementRef.id,
        cid: $payload.settlement.settlementRef.cid
      },
      requested_at: (($payload.settlement.requestedAt | fromdateiso8601) * 1000000),
      allocate_before: (($payload.settlement.allocateBefore | fromdateiso8601) * 1000000),
      settle_before: (($payload.settlement.settleBefore | fromdateiso8601) * 1000000),
      meta: ($payload.settlement.meta.values + $leg.meta.values)
    },
    transfer_leg_id: "payment",
    transfer_leg: {
      receiver: $leg.receiver,
      amount: $leg.amount,
      meta: $leg.meta.values
    }
  }')
allocation_response=$(http_json POST "$user_validator/v0/allocations" \
  "$user_wallet_token" "$allocation_body")
allocation_cid=$(jq -r '.output.allocation_cid // empty' <<<"$allocation_response")
if [[ -z "$allocation_cid" ]]; then
  echo "Wallet did not return a completed allocation." >&2
  echo "$allocation_response" >&2
  exit 1
fi
echo "  7/10 Canton Coin allocated by investor wallet"

context=$(http_json POST \
  "$registry/registry/allocations/v1/$allocation_cid/choice-contexts/execute-transfer" \
  '' '{"meta":{}}')
choice_args=$(jq -nc --arg allocation "$allocation_cid" --argjson context "$context" \
  '{allocationCid:$allocation,
    extraArgs:{context:$context.choiceContextData,meta:{values:{}}}}')
command=$(jq -nc --arg template "$v2:TokenizedPaymentRequest" \
  --arg cid "$request_cid" --argjson args "$choice_args" \
  '{ExerciseCommand:{templateId:$template,contractId:$cid,
    choice:"CompleteTokenizedPayment",choiceArgument:$args}}')
disclosures=$(jq -c \
  '[.disclosedContracts[] | {templateId,contractId,createdEventBlob,synchronizerId}]' \
  <<<"$context")
response=$(submit_command "$provider_ledger" "$provider_token" "$provider_party" \
  "$run_id-complete-payment" "$command" "$disclosures")
payment_cid=$(created_cid "$response" ':Settlement.Regulated:PaymentPrepared')
echo "  8/10 Allocation executed atomically with payment preparation"

choice_args=$(jq -nc --arg ref "$run_id-delivery" '{deliveryRef:$ref}')
command=$(jq -nc --arg template "$v1:PaymentPrepared" --arg cid "$payment_cid" \
  --argjson args "$choice_args" \
  '{ExerciseCommand:{templateId:$template,contractId:$cid,
    choice:"ConfirmDelivery",choiceArgument:$args}}')
response=$(submit_command "$provider_ledger" "$provider_token" "$provider_party" \
  "$run_id-confirm-delivery" "$command")
ready_cid=$(created_cid "$response" ':Settlement.Regulated:ReadyToSettle')
echo "  9/10 Custodian delivery confirmed"

command=$(jq -nc --arg template "$v1:ReadyToSettle" --arg cid "$ready_cid" \
  '{ExerciseCommand:{templateId:$template,contractId:$cid,
    choice:"FinalizeSettlement",choiceArgument:{}}}')
response=$(submit_command "$provider_ledger" "$provider_token" "$provider_party" \
  "$run_id-finalize" "$command")
receipt_cid=$(created_cid "$response" ':Settlement.Regulated:SettlementReceipt')
settled_at=$(jq -r \
  '.transaction.events[] | .CreatedEvent? | select(. != null) |
    select(.templateId | endswith(":Settlement.Regulated:SettlementReceipt")) |
    .createArgument.settledAt' <<<"$response")
echo " 10/10 Settlement receipt created"

sleep 1
user_balance_after=$(balance "$user_validator" "$user_wallet_token")
provider_balance_after=$(balance "$provider_validator" "$provider_wallet_token")
remaining_requests=$(http_json GET \
  "$user_validator/v0/wallet/token-standard/allocation-requests" \
  "$user_wallet_token" | jq --arg cid "$request_cid" \
  '[.allocation_requests[] | select(.contract.contract_id == $cid)] | length')
remaining_allocations=$(http_json GET "$user_validator/v0/allocations" \
  "$user_wallet_token" | jq --arg cid "$allocation_cid" \
  '[.allocations[] | select(.contract.contract_id == $cid)] | length')

if [[ "$remaining_requests" != 0 || "$remaining_allocations" != 0 ]]; then
  echo "Expected the request and allocation to be consumed." >&2
  exit 1
fi

cat <<RESULT

LocalNet regulated settlement completed
  run_id:                  $run_id
  investor_party:          $user_party
  provider_party:          $provider_party
  allocation_cid:          $allocation_cid (consumed)
  settlement_receipt_cid:  $receipt_cid
  settled_at:              $settled_at
  investor_balance:        $user_balance_before -> $user_balance_after Amulet
  provider_balance:        $provider_balance_before -> $provider_balance_after Amulet
RESULT
DEMO
