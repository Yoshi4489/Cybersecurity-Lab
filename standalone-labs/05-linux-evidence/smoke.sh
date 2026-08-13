#!/bin/sh
set -eu

: "${LAB05_FILESYSTEM_FLAG:?smoke runner must inject expected flags}"
: "${LAB05_LOG_FLAG:?smoke runner must inject expected flags}"
: "${LAB05_BINARY_FLAG:?smoke runner must inject expected flags}"
: "${LAB05_FINAL_FLAG:?smoke runner must inject expected flags}"

base="http://172.30.55.55:8080"
work="/tmp/lab05-smoke-$$"
mkdir -p "$work"

attempt=0
until curl -fsS "$base/manifest" >"$work/manifest" 2>/dev/null; do
  attempt=$((attempt + 1))
  test "$attempt" -lt 30 || { echo "evidence vault did not become ready" >&2; exit 1; }
  sleep 1
done
grep -q '^case=EV-55$' "$work/manifest"

curl -fsS "$base/case-55.tar" -o "$work/case-55.tar"
archive_sha="$(sha256sum "$work/case-55.tar" | cut -d ' ' -f 1)"
tar -tf "$work/case-55.tar" | grep -q 'case-55/logs/access.log'
mkdir "$work/unpacked"
tar -xf "$work/case-55.tar" -C "$work/unpacked"

find "$work/unpacked" -type f -print0 | xargs -0 file >"$work/file-types"
grep -Eq 'session\.bin:[[:space:]]+data$' "$work/file-types"
mode="$(stat -c '%a' "$work/unpacked/case-55/notes/.handoff.b64")"
test "$mode" = "400"
filesystem="$(find "$work/unpacked" -name '*.b64' -print0 | xargs -0 base64 -d | sed -n 's/^filesystem_proof=//p')"
test "$filesystem" = "$LAB05_FILESYSTEM_FLAG"

top_source="$(cut -d ' ' -f 1 "$work/unpacked/case-55/logs/access.log" | sort | uniq -c | sort -nr | awk 'NR == 1 { print $2 }')"
test "$top_source" = "10.55.0.23"
log_proof="$(grep "$top_source" "$work/unpacked/case-55/logs/access.log" | sed -n 's#.*GET /proof/\([^ ]*\) .*#\1#p')"
test "$log_proof" = "$LAB05_LOG_FLAG"

binary_proof="$(strings "$work/unpacked/case-55/artifacts/session.bin" | sed -n 's/^binary_proof=//p')"
test "$binary_proof" = "$LAB05_BINARY_FLAG"

final="$(curl -fsS -X POST \
  --data-urlencode "filesystem=$filesystem" \
  --data-urlencode "logs=$log_proof" \
  --data-urlencode "binary=$binary_proof" \
  --data-urlencode "top_source=$top_source" \
  --data-urlencode "archive_sha256=$archive_sha" \
  --data-urlencode 'case=EV-55' \
  "$base/final" | sed -n 's/^final_proof=//p')"
test "$final" = "$LAB05_FINAL_FLAG"

echo "lab 05 smoke: all chained objectives passed"
