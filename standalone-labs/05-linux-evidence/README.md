# Lab 05 — Linux Evidence Hunt

แลปเดี่ยวสำหรับฝึก Linux command-line forensics กับชุดหลักฐานสมมติที่ target สร้างใหม่ตอนเริ่ม container และให้ดาวน์โหลดแบบ read-only ไม่มี SSH, `sudo`, SUID exploitation หรือ privilege escalation

## เริ่มและเข้า Toolbox

รันจาก root ของ repository:

```sh
node scripts/standalone-labctl.mjs start 05-linux-evidence
node scripts/standalone-labctl.mjs shell 05-linux-evidence
```

ขอบเขตคือ `172.30.55.0/24` และ case `EV-55` เท่านั้น

## Walkthrough

1. รับ manifest และ archive แล้วตรวจ checksum/รายการก่อนแตกไฟล์:

   ```sh
   curl -fsS http://172.30.55.55:8080/manifest
   curl -fsS http://172.30.55.55:8080/case-55.tar -o /tmp/case-55.tar
   sha256sum /tmp/case-55.tar
   tar -tf /tmp/case-55.tar
   mkdir -p /tmp/evidence && tar -xf /tmp/case-55.tar -C /tmp/evidence
   ```

2. สำรวจชนิดไฟล์ เวลา และ permissions แล้ว decode note ที่ซ่อนอยู่:

   ```sh
   find /tmp/evidence -type f -print0 | xargs -0 file
   find /tmp/evidence -type f -exec stat -c '%a %y %n' {} \;
   find /tmp/evidence -name '*.b64' -print0 | xargs -0 base64 -d
   ```

   `.handoff.b64` mode `400` จะให้ filesystem proof

3. หาต้นทางที่ปรากฏบ่อยที่สุดและ proof ที่เกี่ยวข้อง โดยลองทั้ง pipeline และ `awk`:

   ```sh
   cut -d ' ' -f 1 /tmp/evidence/case-55/logs/access.log \
     | sort | uniq -c | sort -nr
   awk '{count[$1]++} END {for (ip in count) print count[ip], ip}' \
     /tmp/evidence/case-55/logs/access.log | sort -nr
   grep '10.55.0.23' /tmp/evidence/case-55/logs/access.log \
     | sed -n 's#.*GET /proof/\([^ ]*\) .*#\1#p'
   ```

4. ตรวจ printable strings ใน binary artifact:

   ```sh
   strings /tmp/evidence/case-55/artifacts/session.bin
   ```

5. ส่ง proof ทั้งสาม, top source, case ID และ SHA-256 ของ archive เพื่อรับ final proof:

   ```sh
   curl -X POST \
     --data-urlencode 'filesystem=<filesystem-proof>' \
     --data-urlencode 'logs=<log-proof>' \
     --data-urlencode 'binary=<binary-proof>' \
     --data-urlencode 'top_source=10.55.0.23' \
     --data-urlencode 'archive_sha256=<sha256-from-step-1>' \
     --data-urlencode 'case=EV-55' \
     http://172.30.55.55:8080/final
   ```

## ตรวจสุขภาพและรีเซ็ต

```sh
node scripts/standalone-labctl.mjs smoke 05-linux-evidence
node scripts/standalone-labctl.mjs reset 05-linux-evidence
```

เชิงป้องกัน: เก็บ original evidence แบบ immutable, บันทึก cryptographic hash ก่อนวิเคราะห์, ทำงานบนสำเนา และรักษา chain of custody
