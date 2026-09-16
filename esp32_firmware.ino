/*
  ============================================================
  4-Axis Robot Arm Controller for ESP32
  Classroom IoT Project - Web Serial Receiver
  ============================================================
  Baud rate: 115200
  Input Format: "base,shoulder,elbow,gripper\n"
  Example: "90,120,45,10\n"
  Range: 0 - 180 degrees for each servo
  ============================================================
*/

#include <ESP32Servo.h>

// กำหนดขา GPIO สำหรับ Servo แต่ละแกน (สามารถปรับเปลี่ยนตามบอร์ดของคุณ)
const int PIN_SERVO_BASE     = 18; // Base rotation (ฐานหมุน)
const int PIN_SERVO_SHOULDER = 19; // Shoulder axis (หัวไหล่)
const int PIN_SERVO_ELBOW    = 21; // Elbow axis (ข้อศอก)
const int PIN_SERVO_GRIPPER  = 22; // Gripper (มือจับ)

// สร้าง Servo objects
Servo servoBase;
Servo servoShoulder;
Servo servoElbow;
Servo servoGripper;

// ตัวแปรเก็บค่าองศาปัจจุบัน (เริ่มต้นที่ Home Position = 90)
int currentBase = 90;
int currentShoulder = 90;
int currentElbow = 90;
int currentGripper = 90;

void setup() {
  Serial.begin(115200);
  delay(500);

  // ตั้งค่าความถี่ Servo มาตรฐาน (50Hz สำหรับ SG90 / MG996R)
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);
  
  servoBase.setPeriodHertz(50);
  servoShoulder.setPeriodHertz(50);
  servoElbow.setPeriodHertz(50);
  servoGripper.setPeriodHertz(50);

  // ผูก Servo กับ Pin และกำหนดช่วง Pulse (500-2400us)
  servoBase.attach(PIN_SERVO_BASE, 500, 2400);
  servoShoulder.attach(PIN_SERVO_SHOULDER, 500, 2400);
  servoElbow.attach(PIN_SERVO_ELBOW, 500, 2400);
  servoGripper.attach(PIN_SERVO_GRIPPER, 500, 2400);

  // ตั้งค่าเริ่มต้นไปที่ Home Position
  servoBase.write(currentBase);
  servoShoulder.write(currentShoulder);
  servoElbow.write(currentElbow);
  servoGripper.write(currentGripper);

  Serial.println("ESP32 4-Axis Robot Arm Ready!");
  Serial.println("Listening on Serial (115200 baud)...");
}

void loop() {
  // ตรวจสอบว่ามีข้อมูลส่งมาจาก Web Serial API หรือไม่
  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\n');
    input.trim(); // ตัด whitespace และ \r ออก

    if (input.length() > 0) {
      parseAndMoveArm(input);
    }
  }
}

// แยกสตริงรูปแบบ "base,shoulder,elbow,gripper"
void parseAndMoveArm(String data) {
  int firstComma = data.indexOf(',');
  int secondComma = data.indexOf(',', firstComma + 1);
  int thirdComma = data.indexOf(',', secondComma + 1);

  if (firstComma > 0 && secondComma > firstComma && thirdComma > secondComma) {
    int b = data.substring(0, firstComma).toInt();
    int s = data.substring(firstComma + 1, secondComma).toInt();
    int e = data.substring(secondComma + 1, thirdComma).toInt();
    int g = data.substring(thirdComma + 1).toInt();

    // ตรวจสอบความถูกต้องและจำกัดช่วง 0 - 180 องศา (Constrain)
    currentBase     = constrain(b, 0, 180);
    currentShoulder = constrain(s, 0, 180);
    currentElbow    = constrain(e, 0, 180);
    currentGripper  = constrain(g, 0, 180);

    // สั่งหมุน Servo ไปยังองศาที่กำหนด
    servoBase.write(currentBase);
    servoShoulder.write(currentShoulder);
    servoElbow.write(currentElbow);
    servoGripper.write(currentGripper);

    // ส่งข้อความยืนยันกลับไปยัง Web Host
    Serial.printf("ACK: B=%d, S=%d, E=%d, G=%d\n", currentBase, currentShoulder, currentElbow, currentGripper);
  }
}
