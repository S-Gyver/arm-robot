#include <Arduino.h>
#line 1 "C:\\Users\\student\\Web\\arm robot\\firmware\\firmware.ino"
/*
  ============================================================
  Multi-Axis Robot Arm Controller for ESP32 (Universal 2 - 6 Servos)
  Classroom IoT Project - Web Serial Receiver & Web Flasher
  ============================================================
  Baud rate: 115200
  Input Format: CSV angles ending with newline e.g.
    - 2 Servos: "90,90\n"
    - 3 Servos: "90,90,90\n"
    - 4 Servos: "90,120,45,10\n"
    - 5 Servos: "90,120,45,90,10\n"
    - 6 Servos: "90,120,45,90,90,10\n"
  Range: 0 - 180 degrees for each servo
  ============================================================
*/

#include <ESP32Servo.h>

// กำหนดขา GPIO สำหรับ Servo 1 ถึง 6 (ปรับเปลี่ยนได้ตามที่ต่อจริง)
// S1: ฐาน (Base) -> GPIO 16
// S2: หัวไหล่ (Shoulder) -> GPIO 17
// S3: ข้อศอก (Elbow) -> GPIO 18
// S4: ข้อมือก้มเงย หรือ มือจับ (Wrist Pitch / Gripper) -> GPIO 19
// S5: ข้อมือหมุน หรือ มือจับ (Wrist Roll / Gripper) -> GPIO 21
// S6: มือจับ (Gripper) -> GPIO 22
const int TOTAL_SERVOS = 6;
const int SERVO_PINS[TOTAL_SERVOS] = {16, 17, 18, 19, 21, 22};

Servo servos[TOTAL_SERVOS];
int currentAngles[TOTAL_SERVOS] = {90, 90, 90, 90, 90, 90};
bool isAttached[TOTAL_SERVOS] = {false, false, false, false, false, false};

void parseAndMoveArm(String data);

#line 35 "C:\\Users\\student\\Web\\arm robot\\firmware\\firmware.ino"
void setup();
#line 60 "C:\\Users\\student\\Web\\arm robot\\firmware\\firmware.ino"
void loop();
#line 35 "C:\\Users\\student\\Web\\arm robot\\firmware\\firmware.ino"
void setup() {
  Serial.begin(115200);
  delay(300);

  // จอง Hardware Timer PWM สำหรับ ESP32
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);

  // ตั้งค่าและผูก Servo เริ่มต้น 6 ช่องเพื่อรองรับ 2 - 6 Servos อเนกประสงค์
  for (int i = 0; i < TOTAL_SERVOS; i++) {
    servos[i].setPeriodHertz(50); // 50Hz มาตรฐานสำหรับ SG90 / MG90S / MG996R
    servos[i].attach(SERVO_PINS[i], 500, 2400); // 500us - 2400us pulse
    servos[i].write(currentAngles[i]);
    isAttached[i] = true;
  }

  Serial.println("==================================================");
  Serial.println("ESP32 Multi-Axis Robot Arm Firmware Ready!");
  Serial.println("Supported: 2, 3, 4, 5, 6 Servos (Auto-detect from CSV)");
  Serial.println("Listening on Serial (115200 baud)...");
  Serial.println("==================================================");
}

void loop() {
  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\n');
    input.trim();

    if (input.length() > 0) {
      parseAndMoveArm(input);
    }
  }
}

// แยกสตริง CSV เช่น "90,120,45,10"
void parseAndMoveArm(String data) {
  int servoIndex = 0;
  int startIdx = 0;

  for (int i = 0; i <= data.length() && servoIndex < TOTAL_SERVOS; i++) {
    if (i == data.length() || data.charAt(i) == ',') {
      String token = data.substring(startIdx, i);
      token.trim();
      if (token.length() > 0) {
        int angle = constrain(token.toInt(), 0, 180);
        currentAngles[servoIndex] = angle;
        if (isAttached[servoIndex]) {
          servos[servoIndex].write(angle);
        }
        servoIndex++;
      }
      startIdx = i + 1;
    }
  }

  // ส่ง ACK ยืนยันกลับ
  Serial.print("ACK: ");
  for (int j = 0; j < servoIndex; j++) {
    Serial.print(currentAngles[j]);
    if (j < servoIndex - 1) Serial.print(",");
  }
  Serial.println();
}

