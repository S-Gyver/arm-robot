/**
 * Web Serial API Handler for ESP32 4-Axis Robot Arm
 * Implements TextEncoderStream, WritableStreamDefaultWriter, error handling,
 * and serial state management.
 */

class WebSerialManager {
  constructor(options = {}) {
    this.baudRate = options.baudRate || 115200;
    this.port = null;
    this.writer = null;
    this.encoderStream = null;
    this.reader = null;
    this.decoderStream = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.simulationMode = false;
    
    // Callbacks
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onLog = options.onLog || (() => {});
    this.onDataReceived = options.onDataReceived || (() => {});

    this.checkSupport();
    this.setupAutoDisconnectListener();
  }

  /**
   * ตรวจสอบว่าเบราว์เซอร์รองรับ Web Serial API หรือไม่
   */
  checkSupport() {
    this.isSupported = 'serial' in navigator;
    if (!this.isSupported) {
      console.warn('⚠️ Web Serial API is NOT supported in this browser environment.');
    }
    return this.isSupported;
  }

  /**
   * แจ้งเตือนสถานะความเข้ากันได้
   */
  getSupportDetails() {
    if (!this.isSupported) {
      return {
        supported: false,
        message: 'เบราว์เซอร์นี้ไม่รองรับ Web Serial API กรุณาใช้ Google Chrome หรือ Microsoft Edge และเปิดผ่าน http://localhost หรือ https://'
      };
    }
    return {
      supported: true,
      message: 'Web Serial API พร้อมใช้งาน'
    };
  }

  /**
   * ดักจับเหตุการณ์เมื่อสาย USB ถูกถอดออก
   */
  setupAutoDisconnectListener() {
    if (this.isSupported) {
      navigator.serial.addEventListener('disconnect', (event) => {
        if (event.target === this.port) {
          this.log('⚠️ สาย USB ของ ESP32 ถูกถอดออก (Device Disconnected)', 'warning');
          this.handleDisconnectCleanup();
        }
      });
    }
  }

  /**
   * เชื่อมต่อไปยังบอร์ด ESP32 ผ่าน Web Serial API
   */
  async connect() {
    if (this.isConnected) {
      this.log('บอร์ดเชื่อมต่ออยู่แล้ว', 'info');
      return true;
    }

    if (!this.isSupported) {
      const err = new Error('Web Serial API ไม่รองรับในเบราว์เซอร์นี้ กรุณาเปิดผ่าน Chrome/Edge');
      this.log(err.message, 'error');
      alert(err.message);
      return false;
    }

    this.isConnecting = true;
    this.onStatusChange('connecting', 'กำลังขอเลือกพอร์ต USB...');

    try {
      // 1. เรียกหน้าต่างเลือก COM Port
      this.port = await navigator.serial.requestPort();
      this.log('เลือกพอร์ตสำเร็จ กำลังเปิดพอร์ตที่ Baud Rate ' + this.baudRate + '...', 'info');

      // 2. เปิดการเชื่อมต่อพอร์ต
      await this.port.open({ baudRate: this.baudRate });

      // 3. ตั้งค่า Writable Stream ด้วย TextEncoderStream
      this.encoderStream = new TextEncoderStream();
      this.encoderStream.readable.pipeTo(this.port.writable);
      this.writer = this.encoderStream.writable.getWriter();

      // 4. เริ่มอ่านข้อมูลย้อนกลับจาก ESP32 (เช่น ACK หรือ Debug log)
      this.startReading();

      this.isConnected = true;
      this.isConnecting = false;
      this.simulationMode = false;
      this.onStatusChange('connected', `เชื่อมต่อ ESP32 สำเร็จ (Baud: ${this.baudRate})`);
      this.log(`เชื่อมต่อ ESP32 สำเร็จ! Baud rate: ${this.baudRate}`, 'success');

      return true;
    } catch (error) {
      console.error('Serial connection error:', error);
      this.isConnecting = false;
      this.handleDisconnectCleanup();

      if (error.name === 'NotFoundError') {
        this.log('ผู้ใช้ยกเลิกการเลือกพอร์ต', 'warning');
        this.onStatusChange('disconnected', 'ยกเลิกการเลือกพอร์ต');
      } else {
        const errorMsg = 'เกิดข้อผิดพลาดในการเชื่อมต่อ: ' + error.message;
        this.log(errorMsg, 'error');
        this.onStatusChange('error', errorMsg);
      }
      return false;
    }
  }

  /**
   * เปิดโหมดจำลอง (Simulated Serial) สำหรับกรณีไม่มีบอร์ดต่ออยู่
   */
  enableSimulationMode() {
    this.simulationMode = true;
    this.isConnected = true;
    this.onStatusChange('connected', 'โหมดจำลอง (Simulated ESP32 Virtual Port)');
    this.log('เปิดใช้งานโหมดจำลอง (Simulated Serial) - เหมาะสำหรับทดสอบการทำงาน', 'info');
  }

  /**
   * อ่านข้อมูลที่ ESP32 ส่งกลับมาผ่าน Serial
   */
  async startReading() {
    try {
      this.decoderStream = new TextDecoderStream();
      this.port.readable.pipeTo(this.decoderStream.writable);
      this.reader = this.decoderStream.readable.getReader();

      let buffer = '';
      while (this.isConnected && this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop(); // เก็บท่อนที่ยังไม่จบบรรทัดไว้
          for (const line of lines) {
            const cleanLine = line.trim();
            if (cleanLine) {
              this.onDataReceived(cleanLine);
              this.log(`RX << ${cleanLine}`, 'rx');
            }
          }
        }
      }
    } catch (err) {
      if (this.isConnected) {
        console.warn('Reader stopped or disconnected:', err);
      }
    }
  }

  /**
   * ส่งคำสั่งมุมองศาไปยัง ESP32 ในรูปแบบ CSV คั่นด้วยจุลภาค เช่น "90,90,90,90\n"
   * รองรับ 2, 3, 4, 5, หรือ 6 Servos
   */
  async sendAngles(...args) {
    let angleList = [];
    if (args.length === 1 && Array.isArray(args[0])) {
      angleList = args[0];
    } else if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
      angleList = Object.values(args[0]);
    } else {
      angleList = args;
    }
    const payload = angleList.map(a => Math.round(Number(a) !== undefined && !isNaN(Number(a)) ? Number(a) : 90)).join(',') + '\n';
    return await this.sendRaw(payload);
  }

  /**
   * ส่งข้อความดิบผ่าน Serial Writer
   */
  async sendRaw(text) {
    if (this.simulationMode) {
      this.log(`TX (Sim) >> ${text.trim()}`, 'tx');
      // จำลองการตอบกลับ ACK จาก ESP32
      setTimeout(() => {
        this.onDataReceived(`SIM-ACK: ${text.trim()}`);
      }, 30);
      return true;
    }

    if (!this.isConnected || !this.writer) {
      return false;
    }

    try {
      await this.writer.write(text);
      this.log(`TX >> ${text.trim()}`, 'tx');
      return true;
    } catch (err) {
      this.log(`ส่งข้อมูลล้มเหลว: ${err.message}`, 'error');
      console.error('Serial write error:', err);
      return false;
    }
  }

  /**
   * ตัดการเชื่อมต่อพอร์ต
   */
  async disconnect() {
    this.log('กำลังปิดการเชื่อมต่อพอร์ต...', 'info');
    await this.handleDisconnectCleanup();
    this.onStatusChange('disconnected', 'ตัดการเชื่อมต่อแล้ว');
    this.log('ตัดการเชื่อมต่อเรียบร้อย', 'info');
  }

  /**
   * ล้างทรัพยากร Stream และปิด Port
   */
  async handleDisconnectCleanup() {
    this.isConnected = false;
    this.simulationMode = false;

    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader = null;
      }
    } catch (e) { /* ignore */ }

    try {
      if (this.writer) {
        await this.writer.close();
        this.writer = null;
      }
    } catch (e) { /* ignore */ }

    try {
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
    } catch (e) { /* ignore */ }

    this.onStatusChange('disconnected', 'ไม่ได้เชื่อมต่อ');
  }

  /**
   * บันทึก Log ลงระบบและเรียก Callback
   */
  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    this.onLog({
      timestamp,
      message,
      type
    });
  }
}

window.WebSerialManager = WebSerialManager;
