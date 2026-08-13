#!/bin/sh
set -eu

: "${FLAG_L01_NETWORK_BASELINE:?inject expected flag for smoke test}"
: "${FLAG_L01_SERVICE_BEACON:?inject expected flag for smoke test}"
: "${FLAG_L01_OPERATOR_CONSOLE:?inject expected flag for smoke test}"
: "${FLAG_L01_TRIAGE_PROOF:?inject expected flag for smoke test}"

assert_contains() {
  haystack=$1
  needle=$2
  printf '%s' "$haystack" | grep -F -- "$needle" >/dev/null || {
    echo "smoke assertion failed: missing $needle" >&2
    exit 1
  }
}

resolved=$(getent hosts triage-node)
assert_contains "$resolved" "172.28.1.20"

network=$(curl -fsS http://triage-node:8080/network)
assert_contains "$network" "segment_token=segment-cobalt-41"
assert_contains "$network" "$FLAG_L01_NETWORK_BASELINE"

beacon=$(nc -w 2 triage-node 9090 </dev/null)
assert_contains "$beacon" "service_token=beacon-lantern-27"
assert_contains "$beacon" "$FLAG_L01_SERVICE_BEACON"

operator=$(curl -fsS http://triage-node:7070/operator)
assert_contains "$operator" "operator_token=operator-sable-63"
assert_contains "$operator" "$FLAG_L01_OPERATOR_CONSOLE"

final=$(curl -fsS 'http://triage-node:8080/final?segment=segment-cobalt-41&beacon=beacon-lantern-27&operator=operator-sable-63')
assert_contains "$final" "$FLAG_L01_TRIAGE_PROOF"

echo "01-network-triage smoke: PASS"
