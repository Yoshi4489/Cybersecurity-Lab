#!/bin/sh
set -eu

: "${LAB06_DNS_FLAG:?smoke runner must inject expected flags}"
: "${LAB06_NMAP_FLAG:?smoke runner must inject expected flags}"
: "${LAB06_HTTP_FLAG:?smoke runner must inject expected flags}"
: "${LAB06_FINAL_FLAG:?smoke runner must inject expected flags}"

dns_server="172.30.66.53"
relay="172.30.66.90"
work="/tmp/lab06-smoke-$$"
mkdir -p "$work"

attempt=0
until dig +time=1 +tries=1 "@$dns_server" signals.test SOA +short >/dev/null 2>&1 \
  && curl -fsS "http://$relay:9090/" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  test "$attempt" -lt 30 || { echo "capstone targets did not become ready" >&2; exit 1; }
  sleep 1
done

nslookup -type=ns signals.test "$dns_server" >"$work/nslookup"
grep -q 'ns1.signals.test' "$work/nslookup"
transfer="$(dig "@$dns_server" signals.test AXFR)"
dns_proof="$(printf '%s\n' "$transfer" | awk '/_dns-proof/ {gsub(/"/, "", $NF); print $NF; exit}')"
relay_ip="$(printf '%s\n' "$transfer" | awk '$1 ~ /^relay\./ && $4 == "A" {print $5; exit}')"
test "$dns_proof" = "$LAB06_DNS_FLAG"
test "$relay_ip" = "$relay"

bash -l -c 'test -z "${NMAP_PRIVILEGED+x}"'
nmap -sT -Pn -p 1-10000 "$relay_ip" -oN "$work/nmap.txt" >/dev/null
grep -Eq '^8080/tcp +open' "$work/nmap.txt"
grep -Eq '^9090/tcp +open' "$work/nmap.txt"
ports="$(awk '/^(8080|9090)\/tcp +open/ {sub(/\/tcp/, "", $1); print $1}' "$work/nmap.txt" | sort -n | paste -sd, -)"
test "$ports" = "8080,9090"

headers="$(curl -fsSI "http://$relay:9090/")"
nmap_proof="$(printf '%s\n' "$headers" | sed -n 's/^X-Service-Proof: *//Ip' | tr -d '\r')"
artifact_path="$(printf '%s\n' "$headers" | sed -n 's/^X-Artifact-Path: *//Ip' | tr -d '\r')"
test "$nmap_proof" = "$LAB06_NMAP_FLAG"
test "$artifact_path" = "/artifact/signals-bundle.tar"

curl -fsS "http://$relay:8080$artifact_path" -o "$work/signals-bundle.tar"
bundle_sha="$(sha256sum "$work/signals-bundle.tar" | cut -d ' ' -f 1)"
tar -tf "$work/signals-bundle.tar" | grep -q 'signals-66/logs/relay-access.log'
mkdir "$work/unpacked"
tar -xf "$work/signals-bundle.tar" -C "$work/unpacked"
find "$work/unpacked" -type f -print0 | xargs -0 file >"$work/files"
http_proof="$(grep '^http_proof=' "$work/unpacked/signals-66/manifest.txt" | cut -d= -f2-)"
test "$http_proof" = "$LAB06_HTTP_FLAG"

log="$work/unpacked/signals-66/logs/relay-access.log"
actor="$(cut -d ' ' -f1 "$log" | sort | uniq -c | sort -nr | awk 'NR == 1 {print $2}')"
event="$(grep "^$actor " "$log" | awk '$5 == 200 {print $4}' | sed -n 's#^/events/##p')"
test "$actor" = "relay-7"
test "$event" = "EVT-6604"

final="$(curl -fsS -X POST \
  --data-urlencode "dns=$dns_proof" \
  --data-urlencode "nmap=$nmap_proof" \
  --data-urlencode "http=$http_proof" \
  --data-urlencode "ports=$ports" \
  --data-urlencode "actor=$actor" \
  --data-urlencode "event=$event" \
  --data-urlencode "bundle_sha256=$bundle_sha" \
  --data-urlencode 'case=SG-66' \
  "http://$relay:8080/final" | sed -n 's/^final_proof=//p')"
test "$final" = "$LAB06_FINAL_FLAG"

echo "lab 06 smoke: DNS, Nmap, HTTP, and log chain passed"
