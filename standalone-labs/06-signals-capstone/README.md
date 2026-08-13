# Lab 06 — Signals in the Noise

Capstone แบบ standalone ที่บังคับใช้หลักฐานต่อเนื่องจาก DNS zone transfer → Nmap TCP connect service mapping → HTTP artifact → Linux log correlation ข้อมูล, IP และโดเมนทั้งหมดเป็นของจำลองใน internal Docker network เท่านั้น

## เริ่มและเข้า Toolbox

รันจาก root ของ repository:

```sh
node scripts/standalone-labctl.mjs start 06-signals-capstone
node scripts/standalone-labctl.mjs shell 06-signals-capstone
```

ขอบเขตที่อนุญาตคือ `172.30.66.0/24` ห้ามสแกนระบบภายนอก แลปไม่ให้ `NET_RAW` จึงใช้ Nmap TCP connect scan (`-sT`) เท่านั้น

## Walkthrough

### 1. DNS transfer

หา authoritative server ด้วยสองเครื่องมือ แล้วทดสอบ AXFR ของ zone จำลอง:

```sh
dig @172.30.66.53 signals.test SOA
nslookup -type=ns signals.test 172.30.66.53
dig @172.30.66.53 signals.test AXFR | tee /tmp/signals.axfr
awk '$4 == "A" || $4 == "TXT" {print}' /tmp/signals.axfr
```

เก็บ `_dns-proof`, IP ของ `relay.signals.test` และ case ID `SG-66`

### 2. Nmap service mapping

ค้น TCP services บน host ที่ DNS เปิดเผย และตรวจ HTTP metadata ด้วย safe NSE scripts:

```sh
nmap -sT -Pn -p- 172.30.66.90 -oN /tmp/relay-ports.nmap
nmap -sT -Pn -sV -p 8080,9090 \
  --script http-title,http-headers 172.30.66.90 -oN /tmp/relay-services.nmap
grep -E '^(8080|9090)/tcp' /tmp/relay-ports.nmap
curl -i http://172.30.66.90:9090/
```

เก็บ `X-Service-Proof`, `X-Artifact-Path` และชุดพอร์ตเรียงเป็น `8080,9090`

### 3. HTTP artifact

ดาวน์โหลด archive ตาม route ที่พบ ตรวจ hash และ inventory ก่อนวิเคราะห์:

```sh
curl -fsS http://172.30.66.90:8080/artifact/signals-bundle.tar \
  -o /tmp/signals-bundle.tar
sha256sum /tmp/signals-bundle.tar
tar -tf /tmp/signals-bundle.tar
mkdir -p /tmp/signals && tar -xf /tmp/signals-bundle.tar -C /tmp/signals
find /tmp/signals -type f -print0 | xargs -0 file
grep '^http_proof=' /tmp/signals/signals-66/manifest.txt | cut -d= -f2-
```

### 4. Linux log correlation และ final proof

หา actor ที่มีจำนวนเหตุการณ์สูงสุด แล้วหา successful event ของ actor นั้น:

```sh
LOG=/tmp/signals/signals-66/logs/relay-access.log
cut -d ' ' -f1 "$LOG" | sort | uniq -c | sort -nr
awk '{count[$1]++} END {for (actor in count) print count[actor], actor}' "$LOG" | sort -nr
grep '^relay-7 ' "$LOG" | awk '$5 == 200 {print $4}' | sed -n 's#^/events/##p'
```

ส่ง artifacts จากทุกช่วง ไม่สามารถขอ final proof ด้วย flag เดี่ยว:

```sh
curl -X POST \
  --data-urlencode 'dns=<dns-proof>' \
  --data-urlencode 'nmap=<service-proof>' \
  --data-urlencode 'http=<http-proof>' \
  --data-urlencode 'ports=8080,9090' \
  --data-urlencode 'actor=relay-7' \
  --data-urlencode 'event=EVT-6604' \
  --data-urlencode 'bundle_sha256=<sha256-from-step-3>' \
  --data-urlencode 'case=SG-66' \
  http://172.30.66.90:8080/final
```

## ตรวจสุขภาพและรีเซ็ต

```sh
node scripts/standalone-labctl.mjs smoke 06-signals-capstone
node scripts/standalone-labctl.mjs reset 06-signals-capstone
```

เชิงป้องกัน: ปิด public AXFR, ลดข้อมูลใน service banners/headers, ตรวจ hash ของ artifacts และ correlate DNS/network/application logs ด้วย case/timestamp เดียวกัน
