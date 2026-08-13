# RECON//LAB

สนามฝึก Web Exploitation และ Recon แบบ local-first สำหรับผู้เรียนระดับกลางถึงสูง เป้าหมายและข้อมูลทั้งหมดเป็นของจำลอง อยู่ใน Docker networks ที่ไม่มี outbound internet และ reset ได้จากหน้าเว็บ

## เริ่มใช้งาน

ต้องมี Node.js 22.13+ และ Docker Desktop/Engine ที่กำลังทำงาน

```bash
npm install
npm run lab
```

เปิด `http://127.0.0.1:5173` แล้วกด **START LAB** การ build toolbox ครั้งแรกอาจใช้เวลาหลายนาที หลังจากนั้นเปิด terminal ได้ในหน้า Lab Workspace

หยุดทุก service ด้วย:

```bash
npm run lab:stop
```

สถานะและ logs อยู่ใน `.lab/` ซึ่งถูก ignore จาก Git ความคืบหน้า, notes และคะแนนเก็บใน `.lab/reconlab.sqlite`

## ขอบเขตความปลอดภัย

- ใช้เครื่องมือกับ `gateway`, `recon-node` และ routes ที่บทเรียนระบุเท่านั้น
- ห้ามนำ payload หรือ scanner ไปใช้กับระบบสาธารณะ ระบบองค์กร หรือเป้าหมายที่ไม่ได้รับอนุญาต
- targets ใช้ non-root users, read-only filesystems, dropped capabilities และสอง Docker networks ที่ตั้งเป็น `internal`
- command injection, file upload, traversal และฐานข้อมูลเป็น simulator ภายใน container: ไม่มีการ execute คำสั่ง OS, เขียนไฟล์ผู้ใช้ หรือเชื่อมฐานข้อมูลจริง
- SSRF fetcher เรียกได้เฉพาะสอง internal routes ที่กำหนดไว้ใน code
- Portal, controller, target browser port และ terminal bind เฉพาะ `127.0.0.1`

## โครงหลักสูตร

มี 18 labs: Rules of Engagement, passive/active recon, DNS, HTTP fingerprinting, content discovery, authentication enumeration, IDOR/BOLA, SQL injection, command injection simulation, XSS, CSRF, SSRF, traversal/LFI, upload validation, JWT/mass assignment, business logic และ capstone แบบ chaining

ทุก lab มี Mission brief, scope, objectives/flags, hints ที่หักคะแนน, solution และ field notes พร้อม Playbooks ที่เชื่อม attack flow กับ detection/remediation

## คำสั่งสำหรับผู้พัฒนา

```bash
npm run dev             # portal เท่านั้น
npm run lab:controller  # controller เท่านั้น
npm test                # build + unit/manifest/render tests
npm run lint
```

Controller ยอมรับ lifecycle actions จาก allowlisted lab IDs เท่านั้น และเรียก Docker Compose ด้วย argument คงที่ ไม่รับ container names หรือ shell commands จาก browser
