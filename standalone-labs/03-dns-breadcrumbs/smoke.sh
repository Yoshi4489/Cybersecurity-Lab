#!/bin/sh
set -eu

: "${FLAG_L03_ADDRESS_TRAIL:?inject expected flag for smoke test}"
: "${FLAG_L03_MAIL_TRAIL:?inject expected flag for smoke test}"
: "${FLAG_L03_SERVICE_TRAIL:?inject expected flag for smoke test}"
: "${FLAG_L03_DNS_PROOF:?inject expected flag for smoke test}"

assert_contains() {
  haystack=$1
  needle=$2
  printf '%s' "$haystack" | grep -F -- "$needle" >/dev/null || {
    echo "smoke assertion failed: missing $needle" >&2
    exit 1
  }
}

tries=0
while ! dig @dns-lab -p 5353 entry.recon.test CNAME +short >/tmp/dns-ready 2>/dev/null; do
  tries=$((tries + 1))
  [ "$tries" -lt 15 ] || { echo "DNS service did not become ready" >&2; exit 1; }
  sleep 1
done

cname=$(cat /tmp/dns-ready)
assert_contains "$cname" "atlas.recon.test."
assert_contains "$(dig @dns-lab -p 5353 atlas.recon.test A +short)" "172.28.3.30"
assert_contains "$(dig @dns-lab -p 5353 atlas.recon.test AAAA +short)" "fd28:3::30"
address=$(dig @dns-lab -p 5353 atlas.recon.test TXT +short)
assert_contains "$address" "address_token=address-iris-30"
assert_contains "$address" "$FLAG_L03_ADDRESS_TRAIL"

mail_lookup=$(nslookup -port=5353 -type=MX recon.test dns-lab 2>&1)
assert_contains "$mail_lookup" "mail.recon.test"
mail=$(dig @dns-lab -p 5353 mail.recon.test TXT +short)
assert_contains "$mail" "mail_token=mail-kestrel-25"
assert_contains "$mail" "$FLAG_L03_MAIL_TRAIL"

service_lookup=$(dig @dns-lab -p 5353 _ops._tcp.recon.test SRV +short)
assert_contains "$service_lookup" "8088 vault.ops.recon.test."
reverse_lookup=$(nslookup -port=5353 -type=PTR 172.28.3.30 dns-lab 2>&1)
assert_contains "$reverse_lookup" "vault.ops.recon.test"
service=$(dig @dns-lab -p 5353 vault.ops.recon.test TXT +short)
assert_contains "$service" "service_token=service-vault-8088"
assert_contains "$service" "$FLAG_L03_SERVICE_TRAIL"

final=$(curl -fsS 'http://172.28.3.30:8088/final?address=address-iris-30&mail=mail-kestrel-25&service=service-vault-8088')
assert_contains "$final" "$FLAG_L03_DNS_PROOF"

echo "03-dns-breadcrumbs smoke: PASS"
