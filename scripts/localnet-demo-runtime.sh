#!/usr/bin/env bash

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
demo_interactive=${DEMO_INTERACTIVE:-false}
demo_show_negative=${DEMO_SHOW_NEGATIVE:-false}
demo_verbose=${DEMO_VERBOSE:-false}
v1='#canton-regulated-settlement-model:Settlement.Regulated'
v2="$TOKENIZED_PACKAGE_ID:Settlement.TokenizedPayment"
provider_ledger='http://canton:3975'
user_ledger='http://canton:2975'
provider_validator="http://splice:3${VALIDATOR_ADMIN_API_PORT_SUFFIX}/api/validator"
user_validator="http://splice:2${VALIDATOR_ADMIN_API_PORT_SUFFIX}/api/validator"
registry='http://splice:5012'

detail() {
  if [[ "$demo_verbose" == true ]]; then
    printf '       %s\n' "$*"
  fi
}

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

command_body() {
  local command_name=$1 actor=$2 command=$3 disclosures=${4:-[]}
  jq -nc \
    --argjson command "$command" \
    --argjson disclosures "$disclosures" \
    --arg actor "$actor" \
    --arg command_id "$command_name-$(date +%s)-$RANDOM" \
    '{commands:{commands:[$command],commandId:$command_id,
      actAs:[$actor],readAs:[$actor],deduplicationPeriod:{Empty:{}},
      disclosedContracts:$disclosures}}'
}

submit_command() {
  local ledger=$1 token=$2 actor=$3 command_name=$4 command=$5
  local disclosures=${6:-[]}
  local body
  body=$(command_body "$command_name" "$actor" "$command" "$disclosures")
  http_json POST "$ledger/v2/commands/submit-and-wait-for-transaction" \
    "$token" "$body"
}

submit_command_must_fail() {
  local ledger=$1 token=$2 actor=$3 command_name=$4 command=$5
  local disclosures=${6:-[]}
  local body response status response_body error_code error_cause
  body=$(command_body "$command_name" "$actor" "$command" "$disclosures")
  response=$(curl -sS -w $'\n%{http_code}' \
    "$ledger/v2/commands/submit-and-wait-for-transaction" \
    -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' \
    --data-raw "$body")
  status=$(tail -n 1 <<<"$response")
  response_body=$(sed '$d' <<<"$response")

  if [[ "$status" =~ ^2 ]]; then
    echo "Expected $command_name to fail, but Canton accepted it." >&2
    return 1
  fi

  error_code=$(jq -r '.code // "LEDGER_REJECTION"' <<<"$response_body")
  error_cause=$(jq -r '.cause // .message // "Command rejected"' <<<"$response_body")
  if [[ "$error_code" != DAML_AUTHORIZATION_ERROR ]]; then
    echo "Expected DAML_AUTHORIZATION_ERROR, but Canton returned $error_code." >&2
    echo "$error_cause" >&2
    return 1
  fi
  echo "       Canton rejected the investor: $error_code"
  detail "$error_cause"
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

assert_contract_active() {
  local ledger=$1 token=$2 party=$3 cid=$4 label=$5
  local body events
  body=$(jq -nc --arg cid "$cid" --arg party "$party" \
    '{contractId:$cid,
      eventFormat:{filtersByParty:{($party):{}},verbose:false}}')
  events=$(http_json POST "$ledger/v2/events/events-by-contract-id" "$token" "$body")
  if ! jq -e '.created != null and .archived == null' <<<"$events" >/dev/null; then
    echo "$label was not active after the rejected transaction." >&2
    return 1
  fi
  detail "$label remains active"
}

balance() {
  local validator=$1 token=$2
  http_json GET "$validator/v0/wallet/balance" "$token" |
    jq -r .effective_unlocked_qty
}

assert_balance_transfer() {
  local user_before=$1 user_after=$2 provider_before=$3 provider_after=$4 amount=$5
  if ! jq -en \
    --arg user_before "$user_before" \
    --arg user_after "$user_after" \
    --arg provider_before "$provider_before" \
    --arg provider_after "$provider_after" \
    --arg amount "$amount" '
      ($amount | tonumber) as $expected |
      (($user_before | tonumber) - ($user_after | tonumber)) as $user_delta |
      (($provider_after | tonumber) - ($provider_before | tonumber)) as $provider_delta |
      ($user_delta >= ($expected - 0.000000001)) and
      ($user_delta <= ($expected + 0.000000001)) and
      ($provider_delta >= ($expected - 0.000000001)) and
      ($provider_delta <= ($expected + 0.000000001))
    ' >/dev/null; then
    echo "Wallet balances did not move by the expected $amount Amulet." >&2
    return 1
  fi
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
asset_instrument=$(jq -nc --arg admin "$provider_party" \
  '{admin:$admin,id:"PC-NOTE-LOCALNET"}')

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
detail "EligibilityAttestation: $attestation_cid"

args=$(jq -nc --argjson terms "$terms" \
  --arg offer "$offer_expires" --arg settle "$settle_before" \
  '{terms:$terms,offerExpiresAt:$offer,settleBefore:$settle}')
command=$(jq -nc --arg template "$v1:AssetOffer" --argjson args "$args" \
  '{CreateCommand:{templateId:$template,createArguments:$args}}')
response=$(submit_command "$provider_ledger" "$provider_token" "$provider_party" \
  "$run_id-offer" "$command")
offer_cid=$(created_cid "$response" ':Settlement.Regulated:AssetOffer')
echo "  2/10 Private-credit units offered"
detail "AssetOffer: $offer_cid"

choice_args=$(jq -nc --arg cid "$attestation_cid" \
  '{eligibilityAttestationCid:$cid}')
command=$(jq -nc --arg template "$v1:AssetOffer" --arg cid "$offer_cid" \
  --argjson args "$choice_args" \
  '{ExerciseCommand:{templateId:$template,contractId:$cid,
    choice:"AcceptOffer",choiceArgument:$args}}')
response=$(submit_command "$user_ledger" "$user_token" "$user_party" \
  "$run_id-accept-offer" "$command")
pending_cid=$(created_cid "$response" ':Settlement.Regulated:CompliancePending')
echo "  3/10 Investor accepted the offer"
detail "CompliancePending: $pending_cid"

command=$(jq -nc --arg template "$v1:CompliancePending" --arg cid "$pending_cid" \
  '{ExerciseCommand:{templateId:$template,contractId:$cid,
    choice:"ApproveCompliance",choiceArgument:{}}}')
response=$(submit_command "$provider_ledger" "$provider_token" "$provider_party" \
  "$run_id-approve-compliance" "$command")
agreement_cid=$(created_cid "$response" ':Settlement.Regulated:PurchaseAgreement')
echo "  4/10 Compliance approved the purchase"
detail "PurchaseAgreement: $agreement_cid"

args=$(jq -nc \
  --arg request "$run_id-payment" \
  --argjson terms "$terms" \
  --arg agreement "$agreement_cid" \
  --arg attestation "$attestation_cid" \
  --argjson instrument "$instrument" \
  --argjson asset_instrument "$asset_instrument" \
  --arg requested "$requested_at" \
  --arg allocate "$allocate_before" \
  --arg settle "$settle_before" \
  '{requestId:$request,terms:$terms,agreementCid:$agreement,
    eligibilityAttestationCid:$attestation,paymentInstrumentId:$instrument,
    assetInstrumentId:$asset_instrument,
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
delivery_pending_cid=$(created_cid "$response" \
  ':Settlement.TokenizedPayment:DeliveryApprovalPending')

command=$(jq -nc --arg template "$v2:DeliveryApprovalPending" \
  --arg cid "$delivery_pending_cid" \
  '{ExerciseCommand:{templateId:$template,contractId:$cid,
    choice:"ApprovePrivateCreditDelivery",choiceArgument:{}}}')
response=$(submit_command "$provider_ledger" "$provider_token" "$provider_party" \
  "$run_id-approve-delivery" "$command")
approved_cid=$(created_cid "$response" \
  ':Settlement.TokenizedPayment:ApprovedTokenizedPayment')
delivery_allocation_cid=$(created_cid "$response" \
  ':Settlement.PrivateCreditToken:PrivateCreditAllocation')
echo "  5/10 Custodian reserved the tokenized private-credit units"
detail "Private-credit Allocation: $delivery_allocation_cid"

command=$(jq -nc --arg template "$v2:ApprovedTokenizedPayment" \
  --arg cid "$approved_cid" \
  '{ExerciseCommand:{templateId:$template,contractId:$cid,
    choice:"AcceptTokenizedPayment",choiceArgument:{}}}')
response=$(submit_command "$user_ledger" "$user_token" "$user_party" \
  "$run_id-accept-payment" "$command")
request_cid=$(created_cid "$response" \
  ':Settlement.TokenizedPayment:TokenizedPaymentRequest')
echo "  6/10 Two-leg DvP request authorized by all parties"
detail "TokenizedPaymentRequest: $request_cid"

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
echo "  7/10 Standard wallet discovered the Canton Coin leg"

if [[ "$demo_interactive" == true ]]; then
  cat <<'PAUSE'

       Browser checkpoint
       Open: http://wallet.localhost:2000/allocations
       Show the 10 Amulet payment request and its settlement metadata.
       Do not click Accept; the runner will perform that wallet action next.
PAUSE
  printf '       Press Enter to allocate Canton Coin... '
  read -r
  echo
fi

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
echo "  8/10 Investor wallet allocated $payment_amount Canton Coin"
detail "Allocation: $allocation_cid"

context=$(http_json POST \
  "$registry/registry/allocations/v1/$allocation_cid/choice-contexts/execute-transfer" \
  '' '{"meta":{}}')
choice_args=$(jq -nc --arg allocation "$allocation_cid" --argjson context "$context" \
  '{paymentAllocationCid:$allocation,
    paymentExtraArgs:{context:$context.choiceContextData,meta:{values:{}}},
    deliveryExtraArgs:{context:{values:{}},meta:{values:{}}}}')
command=$(jq -nc --arg template "$v2:TokenizedPaymentRequest" \
  --arg cid "$request_cid" --argjson args "$choice_args" \
  '{ExerciseCommand:{templateId:$template,contractId:$cid,
    choice:"CompleteTokenizedDvP",choiceArgument:$args}}')
disclosures=$(jq -c \
  '[.disclosedContracts[] | {templateId,contractId,createdEventBlob,synchronizerId}]' \
  <<<"$context")

if [[ "$demo_show_negative" == true ]]; then
  echo "       Negative check: investor attempts provider-controlled settlement"
  submit_command_must_fail "$user_ledger" "$user_token" "$user_party" \
    "$run_id-investor-cannot-complete" "$command" "$disclosures"
  assert_contract_active "$user_ledger" "$user_token" "$user_party" \
    "$request_cid" 'Payment request'
  assert_contract_active "$provider_ledger" "$provider_token" "$provider_party" \
    "$agreement_cid" 'Purchase agreement'
  assert_contract_active "$user_ledger" "$user_token" "$user_party" \
    "$allocation_cid" 'Canton Coin allocation'
  assert_contract_active "$provider_ledger" "$provider_token" "$provider_party" \
    "$delivery_allocation_cid" 'Private-credit allocation'
  echo "       Rejection was atomic; request, agreement, and both allocations remain active"
fi

response=$(submit_command "$provider_ledger" "$provider_token" "$provider_party" \
  "$run_id-complete-dvp" "$command" "$disclosures")
asset_holding_cid=$(created_cid "$response" \
  ':Settlement.PrivateCreditToken:PrivateCreditHolding')
echo "  9/10 Canton Coin and private-credit units exchanged atomically"
detail "Investor PrivateCreditHolding: $asset_holding_cid"

receipt_cid=$(created_cid "$response" \
  ':Settlement.TokenizedPayment:TokenizedSettlementReceipt')
settled_at=$(jq -r \
  '.transaction.events[] | .CreatedEvent? | select(. != null) |
    select(.templateId | endswith(":Settlement.TokenizedPayment:TokenizedSettlementReceipt")) |
    .createArgument.settledAt' <<<"$response")
echo " 10/10 Auditor-visible DvP receipt created"
detail "TokenizedSettlementReceipt: $receipt_cid"

sleep 1
user_balance_after=$(balance "$user_validator" "$user_wallet_token")
provider_balance_after=$(balance "$provider_validator" "$provider_wallet_token")
assert_balance_transfer "$user_balance_before" "$user_balance_after" \
  "$provider_balance_before" "$provider_balance_after" "$payment_amount"
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

Atomic DvP settlement complete
  Private-credit units:  $asset_units
  Canton Coin payment:   $payment_amount Amulet
  Investor balance:      $user_balance_before -> $user_balance_after Amulet
  Provider balance:      $provider_balance_before -> $provider_balance_after Amulet
  Settled at:            $settled_at
  Investor asset holding: $asset_holding_cid
  Request and allocations: consumed
RESULT

if [[ "$demo_verbose" == true ]]; then
  cat <<DETAILS
  Run ID:                $run_id
  Investor party:        $user_party
  Provider party:        $provider_party
  Coin allocation CID:   $allocation_cid
  Asset allocation CID:  $delivery_allocation_cid
  DvP receipt:           $receipt_cid
DETAILS
fi
