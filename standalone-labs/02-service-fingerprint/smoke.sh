#!/bin/sh
set -eu

: "${FLAG_L02_FULL_PORT_MAP:?inject expected flag for smoke test}"
: "${FLAG_L02_VERSION_LEDGER:?inject expected flag for smoke test}"
: "${FLAG_L02_HTTP_METADATA:?inject expected flag for smoke test}"
: "${FLAG_L02_FINGERPRINT_PROOF:?inject expected flag for smoke test}"

assert_contains() {
  haystack=$1
  needle=$2
  printf '%s' "$haystack" | grep -F -- "$needle" >/dev/null || {
    echo "smoke assertion failed: missing $needle" >&2
    exit 1
  }
}

inventory=$(curl -fsS http://service-farm:8000/)
assert_contains "$inventory" "port_token=ports-quartz-2222-8000-8443-31337"
assert_contains "$inventory" "$FLAG_L02_FULL_PORT_MAP"

ledger=$(nc -w 2 service-farm 31337 </dev/null)
assert_contains "$ledger" "version_token=version-heron-5.7"
assert_contains "$ledger" "$FLAG_L02_VERSION_LEDGER"

metadata=$(curl -fsS -D - -o /dev/null http://service-farm:8443/)
assert_contains "$metadata" "X-Lab-Metadata-Token: metadata-ember-console"
assert_contains "$metadata" "$FLAG_L02_HTTP_METADATA"

final=$(curl -fsS 'http://service-farm:8000/final?ports=ports-quartz-2222-8000-8443-31337&version=version-heron-5.7&metadata=metadata-ember-console')
assert_contains "$final" "$FLAG_L02_FINGERPRINT_PROOF"

echo "02-service-fingerprint smoke: PASS"
