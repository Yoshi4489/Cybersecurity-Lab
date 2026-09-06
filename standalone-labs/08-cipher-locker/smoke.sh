#!/bin/sh
set -eu

: "${FLAG_L08_MANIFEST:?smoke runner must inject expected flags}"
: "${FLAG_L08_BUNDLE:?smoke runner must inject expected flags}"
: "${FLAG_L08_CARVE:?smoke runner must inject expected flags}"
: "${FLAG_L08_FINAL:?smoke runner must inject expected flags}"

base="http://cipher-vault:8080"
work="/tmp/lab08-smoke-$$"
mkdir -p "$work"

assert_eq() {
  if [ "$1" != "$2" ]; then
    echo "smoke assertion failed: expected [$2] got [$1]" >&2
    exit 1
  fi
}

attempt=0
until curl -fsS "$base/health" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  test "$attempt" -lt 30 || { echo "cipher vault did not become ready" >&2; exit 1; }
  sleep 1
done

# 1) manifest: single base64 layer
manifest_body="$(curl -fsS "$base/manifest" | jq -r .payload | base64 -d)"
assert_eq "$(printf '%s' "$manifest_body" | sed -n 's/^manifest_token=//p')" "cache-cobalt-08"
assert_eq "$(printf '%s' "$manifest_body" | sed -n 's/^objective_flag=//p')" "$FLAG_L08_MANIFEST"

# 2) bundle: checksum, extract, peel double base64
curl -fsS "$base/artifact/cache.tar" -o "$work/cache.tar"
archive_sha="$(sha256sum "$work/cache.tar" | cut -d ' ' -f 1)"
assert_eq "$archive_sha" "$(curl -fsS "$base/manifest" | jq -r .archive_sha256)"
mkdir "$work/unpacked"
tar -xf "$work/cache.tar" -C "$work/unpacked"
bundle_body="$(base64 -d "$work/unpacked/cipher-08/payload.b64" | base64 -d)"
assert_eq "$(printf '%s' "$bundle_body" | sed -n 's/^bundle_token=//p')" "vault-lantern-42"
assert_eq "$(printf '%s' "$bundle_body" | sed -n 's/^objective_flag=//p')" "$FLAG_L08_BUNDLE"

# 3) carve: printable evidence from the binary
carve_token="$(strings "$work/unpacked/cipher-08/session.bin" | sed -n 's/^carve_token=//p')"
carve_flag="$(strings "$work/unpacked/cipher-08/session.bin" | sed -n 's/^binary_proof=//p')"
assert_eq "$carve_token" "locker-sable-71"
assert_eq "$carve_flag" "$FLAG_L08_CARVE"

# 4) final: chain the three tokens plus the archive checksum
final="$(curl -fsS -X POST \
  --data-urlencode 'manifest=cache-cobalt-08' \
  --data-urlencode 'bundle=vault-lantern-42' \
  --data-urlencode 'carve=locker-sable-71' \
  --data-urlencode "archive_sha256=$archive_sha" \
  "$base/final" | sed -n 's/^final_flag=//p')"
assert_eq "$final" "$FLAG_L08_FINAL"

# Missing evidence must never release the final proof.
status=$(curl -sS -o /tmp/negative-report-$ -w '%{http_code}' -X POST  'http://cipher-vault:8080/final')
test "$status" = "403"
! grep -q 'RLAB{' /tmp/negative-report-$

echo "08 smoke: positive chain and incomplete report passed"
