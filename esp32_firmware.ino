/*
  ============================================================
  Multi-Axis Robot Arm Controller for ESP32 (2 to 6 Servos)
  Classroom IoT Project - Web Serial Receiver
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

// ปรับจำนวนเซอร์โวตามโครงสร้างหุ่นยนต์ของคุณ (2, 3, 4, 5 หรือ 6)
#define NUM_SERVOS 4

// กำหนดขา GPIO สำหรับ Servo 1 ถึง 6 (ปรับเปลี่ยนได้ตามที่ต่อจริง)
// S1: ฐาน (Base)
// S2: หัวไหล่ หรือ แขนหลัก (Shoulder/Arm)
// S3: ข้อศอก หรือ มือจับ (Elbow/Gripper)
// S4: ข้อมือ หรือ มือจับ (Wrist/Gripper)
// S5: ข้อมือหมุน (Wrist Roll)
// S6: มือจับ (Gripper)
const int SERVO_PINS[6] = {18, 19, 21, 22, 23, 25};

Servo servos[6];
int currentAngles[6] = {90, 90, 90, 90, 90, 90};

void setup() {
  Serial.begin(115200);
  delay(500);

  // จอง Hardware Timer PWM สำหรับ ESP32
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);

  // ตั้งค่าและผูก Servo ตามจำนวน NUM_SERVOS
  for (int i = 0; i < NUM_SERVOS; i++) {
    servos[i].setPeriodHertz(50); // 50Hz มาตรฐานสำหรับ SG90 / MG996R
    servos[i].attach(SERVO_PINS[i], 500, 2400); // 500us - 2400us pulse
    servos[i].write(currentAngles[i]);
  }

  Serial.printf("ESP32 Multi-Axis Robot Arm Ready! (Active Servos: %d)\n", NUM_SERVOS);
  Serial.println("Listening on Serial (115200 baud)...");
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

  for (int i = 0; i <= data.length() && servoIndex < NUM_SERVOS; i++) {
    if (i == data.length() || data.charAt(i) == ',') {
      String token = data.substring(startIdx, i);
      token.trim();
      if (token.length() > 0) {
        int angle = constrain(token.toInt(), 0, 180);
        currentAngles[servoIndex] = angle;
        servos[servoIndex].write(angle);
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
