# Lab 01 — Network Triage: First Contact

ฝึกสร้าง network baseline จาก Linux toolbox แล้วใช้ TCP connect scan (`nmap -sT`) สำรวจ target ภายใน Docker network ที่แยกขาดจากอินเทอร์เน็ต ทุกชื่อ, IP, token และ service เป็นข้อมูลสมมติสำหรับแล็บนี้เท่านั้น

## เริ่มแล็บ

จาก root ของ repository:

```sh
node scripts/standalone-labctl.mjs start 01-network-triage
node scripts/standalone-labctl.mjs shell 01-network-triage
```

คำสั่งทั้งหมดด้านล่างให้รันใน toolbox เท่านั้น ห้ามเปลี่ยน subnet หรือ target ไปยังระบบอื่น

## Walkthrough

1. ตรวจ interface, route, local listeners และ name resolution:

   ```sh
   ip -brief addr
   ip route
   ss -lntup
   getent hosts triage-node
   ```

2. ใช้ TCP connect scan ซึ่งไม่ต้องใช้ raw-socket capability:

   ```sh
   nmap -sT -Pn -p- triage-node
   ```

3. ตรวจ HTTP discovery service และจด `segment_token` พร้อม objective flag:

   ```sh
   curl -fsS http://triage-node:8080/network
   ```

4. ตรวจ raw TCP beacon และ secondary console จาก ports ที่สแกนพบ:

   ```sh
   nc -v triage-node 9090
   curl -fsS http://triage-node:7070/operator
   ```

5. ประกอบ artifact tokens ทั้งสามเป็น final proof:

   ```sh
   curl -fsS 'http://triage-node:8080/final?segment=<segment_token>&beacon=<service_token>&operator=<operator_token>'
   ```

Objective graph เป็นลำดับ `network-baseline → service-beacon → operator-console → triage-proof`; route สุดท้ายตอบ `403` หาก token ใดไม่ตรง

## ตรวจและรีเซ็ต

ผู้ดูแลสามารถรัน smoke test ผ่าน shared runner ซึ่ง inject expected dynamic flags ชั่วคราวเข้า toolbox แล้วเรียก `/opt/lab/smoke.sh` ห้ามใส่ flags ไว้ใน toolbox environment แบบถาวร

```sh
node scripts/standalone-labctl.mjs smoke 01-network-triage
node scripts/standalone-labctl.mjs reset 01-network-triage
```

## Detection / remediation

- การกวาดทุก TCP port ทำให้เกิด connection attempts ต่อเนื่องในช่วงเวลาสั้น ๆ; ตรวจ firewall/flow logs เพื่อหา fan-out pattern
- ลด exposure ด้วย network segmentation, host firewall, authenticated service discovery และปิด diagnostic listeners ที่ไม่จำเป็น
- แล็บนี้จงใจไม่มี outbound route, ไม่มี target host port และทุก container drop Linux capabilities ทั้งหมด
