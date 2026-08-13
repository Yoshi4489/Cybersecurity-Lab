# Lab 03 — DNS Breadcrumbs: Follow the Records

ฝึกเชื่อมโยง DNS record หลายชนิดด้วย `dig` และ `nslookup` จนพบ hidden HTTP service ข้อมูลทั้งหมดอยู่ใน authoritative DNS จำลองบน isolated Docker network และไม่เกี่ยวข้องกับโดเมนจริง

DNS จำลองฟังที่ port `5353` เพื่อให้รันเป็น non-root หลัง drop capabilities ทั้งหมด จึงต้องระบุ `-p 5353` สำหรับ `dig` หรือ `-port=5353` สำหรับ `nslookup`

## เริ่มแล็บ

```sh
node scripts/standalone-labctl.mjs start 03-dns-breadcrumbs
node scripts/standalone-labctl.mjs shell 03-dns-breadcrumbs
```

## Walkthrough

1. เริ่มจาก alias ที่ได้รับใน brief แล้วตาม CNAME ไปยัง canonical name:

   ```sh
   dig @dns-lab -p 5353 entry.recon.test CNAME +short
   nslookup -port=5353 -type=CNAME entry.recon.test dns-lab
   ```

2. ตรวจทั้ง IPv4, IPv6 และ TXT ที่ canonical name เพื่อเก็บ address artifact:

   ```sh
   dig @dns-lab -p 5353 atlas.recon.test A +short
   dig @dns-lab -p 5353 atlas.recon.test AAAA +short
   dig @dns-lab -p 5353 atlas.recon.test TXT +short
   ```

3. สำรวจ mail route และ policy breadcrumb:

   ```sh
   nslookup -port=5353 -type=MX recon.test dns-lab
   dig @dns-lab -p 5353 mail.recon.test A +short
   dig @dns-lab -p 5353 mail.recon.test TXT +short
   ```

4. ค้น service endpoint จาก SRV, ยืนยันด้วย forward A และ reverse PTR แล้วอ่าน service artifact:

   ```sh
   dig @dns-lab -p 5353 _ops._tcp.recon.test SRV +short
   dig @dns-lab -p 5353 vault.ops.recon.test A +short
   nslookup -port=5353 -type=PTR 172.28.3.30 dns-lab
   dig @dns-lab -p 5353 vault.ops.recon.test TXT +short
   ```

5. ใช้ address, mail และ service tokens ที่พบเปิด final proof ตาม IP/port จาก A และ SRV:

   ```sh
   curl -fsS 'http://172.28.3.30:8088/final?address=<address_token>&mail=<mail_token>&service=<service_token>'
   ```

Objective graph เป็น `address-trail → mail-trail → service-trail → dns-proof`; final route ตอบ `403` จนกว่าจะส่ง artifacts ครบและถูกต้อง

## ตรวจและรีเซ็ต

```sh
node scripts/standalone-labctl.mjs smoke 03-dns-breadcrumbs
node scripts/standalone-labctl.mjs reset 03-dns-breadcrumbs
```

## Detection / remediation

- DNS query logs สามารถเผยลำดับการ enumerate record types และการค้นชื่อที่ผิดปกติได้
- ลด disclosure ด้วย split-horizon DNS, จำกัด records ภายใน, ตรวจความจำเป็นของ TXT/SRV และทบทวน reverse zones
- DNS และ HTTP targets ไม่ publish port สู่ host; Docker network ใช้ `internal: true` และไม่มี internet egress
