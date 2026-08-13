# Lab 02 — Service Fingerprint: Ports Tell Stories

ฝึกทำ full-port inventory, service/version detection, บันทึกผลแบบ `-oA` และใช้ safe NSE scripts กับ service farm จำลองที่อยู่ใน isolated Docker network เท่านั้น

## เริ่มแล็บ

จาก root ของ repository:

```sh
node scripts/standalone-labctl.mjs start 02-service-fingerprint
node scripts/standalone-labctl.mjs shell 02-service-fingerprint
```

## Walkthrough

1. สแกน TCP ports ทั้งหมดด้วย connect scan และเก็บผลสามรูปแบบ (`.nmap`, `.gnmap`, `.xml`) ใน tmpfs ของ toolbox:

   ```sh
   nmap -sT -Pn -p- --min-rate 500 -oA /tmp/service-farm-full service-farm
   ls -l /tmp/service-farm-full.*
   grep '/open/' /tmp/service-farm-full.gnmap
   ```

2. เปิด inventory page จากพอร์ต HTTP ที่พบ เพื่อรับ port artifact และ objective flag:

   ```sh
   curl -fsS http://service-farm:8000/
   ```

3. ทำ version detection เฉพาะ ports ที่พบ และอ่าน synthetic ledger banner:

   ```sh
   nmap -sT -Pn -sV -p2222,8000,8443,31337 service-farm
   nc -v service-farm 31337
   ```

4. ใช้ NSE เฉพาะ scripts ที่ปลอดภัยและระบุไว้:

   ```sh
   nmap -sT -Pn -p2222,31337 --script banner service-farm
   nmap -sT -Pn -p8000,8443 --script http-title,http-headers service-farm
   curl -fsS -D - -o /dev/null http://service-farm:8443/
   ```

5. ส่ง artifacts ทั้งสามไปยัง final endpoint:

   ```sh
   curl -fsS 'http://service-farm:8000/final?ports=<port_token>&version=<version_token>&metadata=<metadata_token>'
   ```

Objective graph เป็นลำดับ `full-port-map → version-ledger → http-metadata → fingerprint-proof`; endpoint สุดท้ายไม่คืน flag หากขาด artifact

## ตรวจและรีเซ็ต

```sh
node scripts/standalone-labctl.mjs smoke 02-service-fingerprint
node scripts/standalone-labctl.mjs reset 02-service-fingerprint
```

## Detection / remediation

- ตรวจ flow logs สำหรับการเชื่อมต่อทุกพอร์ตตามลำดับ และ application logs สำหรับ NSE-style HTTP requests
- ลดข้อมูล version/banner, ปิด unused listeners, ใช้ firewall allowlist และแยก management plane
- ไม่มี target port ใด publish สู่ host และ network ถูกกำหนด `internal: true`
