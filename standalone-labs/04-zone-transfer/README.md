# Lab 04 — Misconfigured Zone Transfer

แลปเดี่ยวสำหรับฝึกหา authoritative DNS ด้วย `dig`/`nslookup`, ตรวจการตั้งค่า AXFR ที่ผิดพลาด และนำข้อมูลใน zone ไปค้น virtual host ต่อ ภายในใช้ข้อมูลและโดเมนสมมติทั้งหมด (`range.test`) และไม่มีเส้นทางออกอินเทอร์เน็ต

## เริ่มและเข้า Toolbox

รันจาก root ของ repository เพื่อให้ runner สร้าง dynamic flags และ `.runtime`:

```sh
node scripts/standalone-labctl.mjs start 04-zone-transfer
node scripts/standalone-labctl.mjs shell 04-zone-transfer
```

ห้ามนำคำสั่งสแกนไปใช้กับระบบที่ไม่ได้รับอนุญาต เป้าหมายของแลปคือ `172.30.44.0/24` เท่านั้น

## Walkthrough

1. ตรวจ SOA/NS และยืนยัน authoritative server ด้วยเครื่องมือสองแบบ:

   ```sh
   dig @172.30.44.53 range.test SOA
   dig @172.30.44.53 range.test NS +short
   nslookup -type=ns range.test 172.30.44.53
   dig @172.30.44.53 _authority.range.test TXT +short
   ```

   ค่า TXT ของ `_authority` คือ proof แรก

2. ทดลอง zone transfer เฉพาะ zone จำลอง แล้วจัดรูปผลลัพธ์ให้อ่านง่าย:

   ```sh
   dig @172.30.44.53 range.test AXFR | tee /tmp/range.axfr
   awk '$4 == "A" || $4 == "TXT" { print }' /tmp/range.axfr
   sed -n '/_axfr-proof/p; /_route/p; /_case/p' /tmp/range.axfr
   ```

   เก็บ proof จาก `_axfr-proof` รวมถึง `host`, `path`, `case` และ `serial`

3. เรียก virtual host ที่ zone เปิดเผย:

   ```sh
   curl -i -H 'Host: ops-archive.range.test' \
     http://172.30.44.80:8080/proof/blue-team
   ```

4. ส่งหลักฐานทั้งสามพร้อม artifacts จาก DNS เพื่อรับ final proof:

   ```sh
   curl -H 'Host: ops-archive.range.test' -X POST \
     --data-urlencode 'authority=<authority-proof>' \
     --data-urlencode 'axfr=<axfr-proof>' \
     --data-urlencode 'vhost=<vhost-proof>' \
     --data-urlencode 'case=ZT-44' \
     --data-urlencode 'serial=2026081304' \
     http://172.30.44.80:8080/final
   ```

## ตรวจสุขภาพและรีเซ็ต

```sh
node scripts/standalone-labctl.mjs smoke 04-zone-transfer
node scripts/standalone-labctl.mjs reset 04-zone-transfer
```

เชิงป้องกัน: authoritative DNS ใน production ควรจำกัด AXFR ด้วย allowlist/TSIG, แยก public/internal views และเฝ้าระวังคำขอ AXFR ที่ผิดปกติ
