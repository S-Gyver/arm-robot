# 🤖 Multi-Axis Robot Arm Controller (2, 3, 4, 5, 6 Servos)

ระบบเว็บแอปพลิเคชันสำหรับควบคุมแขนกลอเนกประสงค์ รองรับการเลือกจำนวนเซอร์โวมอเตอร์ได้ตั้งแต่ **2, 3, 4, 5, และ 6 Servos (2-DOF ถึง 6-DOF)** ควบคุมระยะไกลผ่านสมาร์ตโฟน ออกแบบมาสำหรับการเรียนการสอนในห้องเรียน รองรับหลายกลุ่ม/หลายโต๊ะพร้อมกัน (Multi-Classroom / Multiple Robots) โดยสามารถสลับโหมด 2, 3, 4, 5 หรือ 6 Servos ได้ทันที ทั้งบนหน้าจอ PC Host และ Mobile Controller พร้อมซิงก์กันอัตโนมัติ

---

## 🌟 จุดเด่นและสถาปัตยกรรมระบบ (System Architecture)

```
[ Mobile Controller (Phone) ]  -- (Touch Sliders / 60ms Throttled)
               │
               ▼
[ Supabase Realtime Broker ]   -- (Broadcast Channel: robot-room-XXXX)
               │
               ▼
[ PC Host View (Computer) ]    -- (Web Serial API: TextEncoderStream, 115200 Baud)
               │
               ▼
   [ ESP32 + 4x Servos ]       -- (PWM Control: Base, Shoulder, Elbow, Gripper)
```

1. **PC Host View (`/host.html` หรือหน้าแรกแท็บ PC Host)**
   - สุ่มรหัสห้อง 4 หลัก (เช่น `5921`) พร้อมปุ่มคัดลอกลิงก์ให้นักเรียนเข้าร่วมได้ทันที
   - เชื่อมต่อสาย USB ของ ESP32 ด้วย **Web Serial API** ที่ Baud rate `115200`
   - ส่งคำสั่งองศา Plain String จบด้วย Newline: `base,shoulder,elbow,gripper\n` เช่น `90,120,45,10\n`
   - มี **2D Kinematics Simulator (Canvas)** จำลองการขยับข้อต่อแบบเรียลไทม์ (Smooth Lerp 60 FPS)
   - หน้าต่าง **Serial Communication Log** แสดงสถานะการส่ง (TX) / รับ (RX) แบบสดๆ

2. **Mobile Controller View (`/controller.html` หรือหน้าแรกแท็บ Mobile)**
   - ช่องกรอกรหัส PIN 4 หลักเชื่อมต่อไปยังห้องของหุ่นยนต์ประจำโต๊ะ
   - สไลเดอร์ขนาดใหญ่ 4 แกน เหมาะกับการใช้นิ้วเลื่อนบนมือถือ:
     - **Base (ฐานหมุน)**: 0° - 180°
     - **Shoulder (หัวไหล่)**: 0° - 180°
     - **Elbow (ข้อศอก)**: 0° - 180°
     - **Gripper (มือจับ)**: 0° (ปล่อย) - 180° (คีบแน่น)
   - มีปุ่มจูนละเอียด `+` และ `-` สำหรับการขยับทีละน้อย
   - ระบบ **Throttle (60ms)** ป้องกันข้อความล้น Network และ Buffer ของบอร์ด
   - ปุ่มลัด **Quick Action**:
     - `Home Position (90°)`: รีเซ็ตทุกแกนเข้าตำแหน่งศูนย์กลาง
     - `Grab / Release`: สลับการคีบและปล่อยทันที
     - `Emergency Stop`: ปุ่มหยุดฉุกเฉิน ล็อกตำแหน่งทันที

3. **Dual Split View (`index.html#split`)**
   - โหมดทดสอบแสดงทั้ง PC Host และ Mobile Controller คู่กันในหน้าจอเดียว
   - เหมาะสำหรับการนำเสนอหน้าชั้นเรียน หรือทดสอบฟังก์ชันก่อนต่อบอร์ดจริง

---

## 🛠️ แผนผังการต่อสาย ESP32 (Hardware Wiring)

| ข้อต่อหุ่นยนต์ | ขา Servo (สัญญาณ) | ขา ESP32 (GPIO) | ฟังก์ชัน |
| :--- | :--- | :--- | :--- |
| **Base** | ส้ม/เหลือง | **GPIO 18** | ฐานหมุนซ้าย-ขวา |
| **Shoulder** | ส้ม/เหลือง | **GPIO 19** | ยกแขนขึ้น-ลง |
| **Elbow** | ส้ม/เหลือง | **GPIO 21** | พับข้อศอก |
| **Gripper** | ส้ม/เหลือง | **GPIO 22** | อ้า-หุบก้ามปู |
| **ไฟเลี้ยง (VCC)** | สีแดง | **แหล่งจ่าย 5V 2A-3A ภายนอก** | เลี้ยง Servo ทั้ง 4 ตัว |
| **กราวด์ (GND)** | สีน้ำตาล/ดำ | **GND ร่วมกับ ESP32** | Common Ground |

> ⚠️ **คำแนะนำด้านความปลอดภัย:** เซอร์โวมอเตอร์ 4 ตัวดึงกระแสสูง ไม่ควรต่อไฟเลี้ยงจากขา 3.3V หรือ 5V ของบอร์ด ESP32 โดยตรง ควรใช้ Adapter 5V 2A-3A แยกต่างหาก และนำสาย GND ของแหล่งจ่ายไฟมาต่อเชื่อมกับ GND ของ ESP32 เสมอ

---

## 💻 โค้ด ESP32 Firmware (`esp32_firmware.ino`)

สามารถเปิดไฟล์ `esp32_firmware.ino` ใน Arduino IDE แล้วเลือกบอร์ด ESP32 Dev Module จากนั้น Flash ได้ทันที (ต้องการไลบรารี `ESP32Servo`)

---

## 🚀 วิธีเปิดใช้งาน Web Application

เนื่องจาก **Web Serial API** กำหนดให้ทำงานภายใต้ Secure Context (`http://localhost` หรือ `https://`):

### วิธีที่ 1: รันผ่าน Python Local Server (แนะนำ)
เปิด Terminal หรือ PowerShell ในโฟลเดอร์นี้ แล้วพิมพ์คำสั่ง:
```bash
py -m http.server 3000
```
จากนั้นเปิดเบราว์เซอร์:
- **หน้าหลัก (Portal & Split View)**: `http://localhost:3000/`
- **PC Host View**: `http://localhost:3000/host.html`
- **Mobile Controller View**: `http://<IP-เครื่อง-PC>:3000/controller.html`

---

## 📡 โครงสร้างไฟล์ในโปรเจกต์

- `index.html` - หน้าหลัก รวม Router แท็บ PC Host, Mobile Controller และ Dual Split Screen
- `host.html` - หน้าจอเดี่ยวสำหรับ PC Host พร้อม Web Serial API และ 2D Kinematics
- `controller.html` - หน้าจอเดี่ยวสำหรับ Mobile Controller
- `robotCanvas.js` - ระบบเรนเดอร์กราฟิกแขนกล 2D Forward Kinematics (HTML5 Canvas)
- `serial.js` - โมดูลจัดการ Web Serial API (`navigator.serial`), TextEncoderStream และ Buffer
- `config.js` - การเชื่อมต่อ Supabase Realtime Broker และพารามิเตอร์เริ่มต้น
- `host.js` - Logic ควบคุมฝั่ง PC Host
- `controller.js` - Logic ควบคุมฝั่ง Mobile Controller
- `styles.css` - ตกแต่งธีม Futuristic Dark Glassmorphism และ Large Touch Sliders
- `esp32_firmware.ino` - โค้ด Arduino สำหรับบอร์ด ESP32
