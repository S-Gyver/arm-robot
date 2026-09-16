/**
 * PC Host View Logic
 * Handles Room Code generation, Web Serial API connection with ESP32,
 * Supabase Realtime subscription, 2D Canvas kinematic telemetry, and Serial TX logging.
 */

class HostController {
  constructor(options = {}) {
    this.containerId = options.containerId || 'host-view';
    this.roomCode = this.generateRoomCode();
    this.channel = null;
    this.serial = null;
    this.visualizer = null;
    this.angles = { ...window.ArmConfig.ROBOT_HOME };
    this.txCount = 0;
    this.rxCount = 0;
    this.connectedClientsCount = 0;

    this.init();
  }

  generateRoomCode() {
    // สุ่มรหัส 4 หลัก เช่น 5921
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  init() {
    this.setupVisualizer();
    this.setupSerial();
    this.setupSupabaseChannel();
    this.bindUIEvents();
    this.updateRoomDisplay();
    this.updateTelemetryUI();
  }

  setupVisualizer() {
    const canvas = document.getElementById('host-robot-canvas');
    if (canvas && window.RobotArmVisualizer) {
      this.visualizer = new window.RobotArmVisualizer('host-robot-canvas');
      this.visualizer.setAngles(this.angles.base, this.angles.shoulder, this.angles.elbow, this.angles.gripper);
    }
  }

  setupSerial() {
    this.serial = new window.WebSerialManager({
      baudRate: 115200,
      onStatusChange: (status, message) => {
        this.updateSerialStatus(status, message);
      },
      onLog: (logEntry) => {
        this.appendSerialLog(logEntry);
      },
      onDataReceived: (line) => {
        this.rxCount++;
        const rxCounterEl = document.getElementById('host-rx-counter');
        if (rxCounterEl) rxCounterEl.textContent = this.rxCount;
      }
    });

    // ตรวจสอบ Browser compatibility
    const support = this.serial.getSupportDetails();
    const alertEl = document.getElementById('host-serial-alert');
    if (alertEl && !support.supported) {
      alertEl.classList.remove('hidden');
      alertEl.querySelector('.alert-text').textContent = support.message;
    }
  }

  /**
   * เชื่อมต่อ Supabase Realtime Channel สำหรับห้องนี้
   */
  setupSupabaseChannel() {
    this.supabase = window.ArmConfig.createSupabaseClient();
    if (!this.supabase) {
      console.error('Supabase client not available.');
      this.appendSerialLog({
        timestamp: new Date().toLocaleTimeString(),
        message: 'Supabase client ไม่พร้อมใช้งาน กรุณาตรวจสอบ Network',
        type: 'error'
      });
      return;
    }

    // ทำความสะอาด Channel เก่าถ้ามี
    if (this.channel) {
      try {
        this.supabase.removeChannel(this.channel);
      } catch (e) { /* ignore */ }
    }

    const channelName = `robot-room-${this.roomCode}`;
    
    // ตั้งค่า Broadcast แบบ self: true เพื่อให้รับข้อความได้แน่นอน
    this.channel = this.supabase.channel(channelName, {
      config: {
        broadcast: { ack: false, self: true }
      }
    });

    // 1. รับค่าองศาจาก Mobile Controller ผ่าน Broadcast Event "arm_command"
    this.channel.on('broadcast', { event: 'arm_command' }, (payload) => {
      if (payload && payload.payload) {
        this.handleIncomingCommand(payload.payload);
      }
    });

    // 2. รับคำสั่ง Emergency Stop
    this.channel.on('broadcast', { event: 'emergency_stop' }, () => {
      this.handleEmergencyStop();
    });

    // 3. Heartbeat / Client Connect Ping
    this.channel.on('broadcast', { event: 'client_joined' }, (payload) => {
      this.connectedClientsCount = Math.max(1, this.connectedClientsCount + 1);
      const countEl = document.getElementById('host-clients-count');
      if (countEl) countEl.textContent = `${this.connectedClientsCount} อุปกรณ์`;
      this.appendSerialLog({
        timestamp: new Date().toLocaleTimeString(),
        message: `อุปกรณ์ (${payload?.payload?.sender || 'Mobile'}) เข้าร่วมห้อง #${this.roomCode}`,
        type: 'info'
      });
    });

    this.channel.subscribe(async (status) => {
      const badge = document.getElementById('host-cloud-status');
      if (status === 'SUBSCRIBED') {
        if (badge) {
          badge.className = 'px-3 py-1 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5';
          badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Cloud Ready';
        }
        this.appendSerialLog({
          timestamp: new Date().toLocaleTimeString(),
          message: `เปิดห้อง Realtime #${this.roomCode} สำเร็จ พร้อมรับคำสั่ง`,
          type: 'success'
        });
      } else {
        if (badge) {
          badge.className = 'px-3 py-1 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1.5';
          badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400"></span> ${status}`;
        }
      }
    });

    // 4. Local Bridge: รองรับการทดสอบในหน้าจอเดียวกัน (Split View) หรือข้าม Tab ผ่าน BroadcastChannel
    this.setupLocalFallbackBridge();
  }

  setupLocalFallbackBridge() {
    // กำจัด listener เก่าถ้ามี
    if (this._localBridgeHandler) {
      window.removeEventListener('robot_arm_direct_command', this._localBridgeHandler);
    }
    this._localBridgeHandler = (e) => {
      if (e.detail && String(e.detail.roomCode) === String(this.roomCode)) {
        this.handleIncomingCommand(e.detail.payload);
      }
    };
    window.addEventListener('robot_arm_direct_command', this._localBridgeHandler);

    // Browser-native BroadcastChannel สำหรับข้าม Tab ในเครื่องเดียวกัน
    if ('BroadcastChannel' in window) {
      try {
        if (this.localBroadcastChannel) this.localBroadcastChannel.close();
        this.localBroadcastChannel = new BroadcastChannel(`robot-room-bc-${this.roomCode}`);
        this.localBroadcastChannel.onmessage = (event) => {
          if (event.data && event.data.type === 'arm_command') {
            this.handleIncomingCommand(event.data.payload);
          } else if (event.data && event.data.type === 'emergency_stop') {
            this.handleEmergencyStop();
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel error', e);
      }
    }
  }

  /**
   * ประมวลผลคำสั่งมุมองศาที่ได้รับจาก Mobile Controller
   */
  handleIncomingCommand(data) {
    const { base, shoulder, elbow, gripper } = data;

    if (base !== undefined) this.angles.base = Math.max(0, Math.min(180, Number(base)));
    if (shoulder !== undefined) this.angles.shoulder = Math.max(0, Math.min(180, Number(shoulder)));
    if (elbow !== undefined) this.angles.elbow = Math.max(0, Math.min(180, Number(elbow)));
    if (gripper !== undefined) this.angles.gripper = Math.max(0, Math.min(180, Number(gripper)));

    // อัปเดตตัวเลข Telemetry บน UI
    this.updateTelemetryUI();

    // อัปเดตกราฟิก 2D Kinematics บน Canvas
    if (this.visualizer) {
      this.visualizer.setAngles(this.angles.base, this.angles.shoulder, this.angles.elbow, this.angles.gripper);
    }

    // ส่งต่อไปยังบอร์ด ESP32 ผ่าน Web Serial API ในรูปแบบ "base,shoulder,elbow,gripper\n"
    if (this.serial) {
      this.serial.sendAngles(this.angles.base, this.angles.shoulder, this.angles.elbow, this.angles.gripper);
      this.txCount++;
      const txCounterEl = document.getElementById('host-tx-counter');
      if (txCounterEl) txCounterEl.textContent = this.txCount;
    }
  }

  handleEmergencyStop() {
    this.appendSerialLog({
      timestamp: new Date().toLocaleTimeString(),
      message: '🚨 EMERGENCY STOP TRIGGERED FROM CONTROLLER!',
      type: 'error'
    });
    // แจ้งเตือนสั่นหรือกระพริบบน UI
    const panel = document.getElementById('host-telemetry-panel');
    if (panel) {
      panel.classList.add('ring-4', 'ring-rose-500');
      setTimeout(() => panel.classList.remove('ring-4', 'ring-rose-500'), 1500);
    }
  }

  updateTelemetryUI() {
    const ids = ['base', 'shoulder', 'elbow', 'gripper'];
    ids.forEach(id => {
      const val = Math.round(this.angles[id]);
      const valEl = document.getElementById(`host-val-${id}`);
      const barEl = document.getElementById(`host-bar-${id}`);
      if (valEl) valEl.textContent = `${val}°`;
      if (barEl) {
        const pct = (val / 180) * 100;
        barEl.style.width = `${pct}%`;
      }
    });

    const plainStrEl = document.getElementById('host-serial-string-preview');
    if (plainStrEl) {
      plainStrEl.textContent = `${Math.round(this.angles.base)},${Math.round(this.angles.shoulder)},${Math.round(this.angles.elbow)},${Math.round(this.angles.gripper)}\\n`;
    }
  }

  updateSerialStatus(status, message) {
    const statusDot = document.getElementById('host-serial-dot');
    const statusText = document.getElementById('host-serial-status-text');
    const connectBtn = document.getElementById('host-btn-connect-serial');
    const disconnectBtn = document.getElementById('host-btn-disconnect-serial');

    if (status === 'connected') {
      if (statusDot) {
        statusDot.className = 'w-3 h-3 rounded-full bg-emerald-400 status-glow-green';
      }
      if (statusText) {
        statusText.textContent = 'Connected (ESP32 Ready)';
        statusText.className = 'text-sm font-semibold text-emerald-400';
      }
      if (connectBtn) connectBtn.classList.add('hidden');
      if (disconnectBtn) disconnectBtn.classList.remove('hidden');
    } else if (status === 'connecting') {
      if (statusDot) {
        statusDot.className = 'w-3 h-3 rounded-full bg-amber-400 animate-pulse';
      }
      if (statusText) {
        statusText.textContent = 'Connecting...';
        statusText.className = 'text-sm font-semibold text-amber-400';
      }
    } else {
      if (statusDot) {
        statusDot.className = 'w-3 h-3 rounded-full bg-rose-500 status-glow-red';
      }
      if (statusText) {
        statusText.textContent = 'Disconnected';
        statusText.className = 'text-sm font-semibold text-rose-400';
      }
      if (connectBtn) connectBtn.classList.remove('hidden');
      if (disconnectBtn) disconnectBtn.classList.add('hidden');
    }
  }

  appendSerialLog(entry) {
    const logBox = document.getElementById('host-serial-log-box');
    if (!logBox) return;

    const row = document.createElement('div');
    row.className = 'text-xs font-mono py-0.5 leading-relaxed flex items-start gap-2 border-b border-white/5';

    let colorClass = 'text-slate-300';
    let tag = '[INFO]';
    if (entry.type === 'tx') {
      colorClass = 'text-cyan-400';
      tag = '[TX ➔]';
    } else if (entry.type === 'rx') {
      colorClass = 'text-emerald-400 font-bold';
      tag = '[RX ⬅]';
    } else if (entry.type === 'error') {
      colorClass = 'text-rose-400 font-bold';
      tag = '[ERR]';
    } else if (entry.type === 'warning') {
      colorClass = 'text-amber-400';
      tag = '[WARN]';
    } else if (entry.type === 'success') {
      colorClass = 'text-emerald-400';
      tag = '[OK]';
    }

    row.innerHTML = `
      <span class="text-slate-500 select-none">${entry.timestamp}</span>
      <span class="${colorClass} font-semibold">${tag}</span>
      <span class="${colorClass} flex-1 break-all">${this.escapeHtml(entry.message)}</span>
    `;

    logBox.appendChild(row);
    logBox.scrollTop = logBox.scrollHeight;

    // จำกัดจำนวนแถวไม่ให้เกิน 120 บรรทัด
    while (logBox.children.length > 120) {
      logBox.removeChild(logBox.firstChild);
    }
  }

  escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  updateRoomDisplay() {
    const codeEl = document.getElementById('host-room-code-display');
    if (codeEl) codeEl.textContent = this.roomCode;
    const miniCodeEl = document.getElementById('host-mini-room-code');
    if (miniCodeEl) miniCodeEl.textContent = this.roomCode;
  }

  regenerateRoom() {
    this.roomCode = this.generateRoomCode();
    this.updateRoomDisplay();
    this.setupSupabaseChannel();
    this.appendSerialLog({
      timestamp: new Date().toLocaleTimeString(),
      message: `เปลี่ยนรหัสห้องใหม่เป็น #${this.roomCode}`,
      type: 'info'
    });
  }

  bindUIEvents() {
    // ปุ่มเชื่อมต่อ USB
    const connectBtn = document.getElementById('host-btn-connect-serial');
    if (connectBtn) {
      connectBtn.addEventListener('click', () => {
        this.serial.connect();
      });
    }

    // ปุ่มตัดการเชื่อมต่อ USB
    const disconnectBtn = document.getElementById('host-btn-disconnect-serial');
    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', () => {
        this.serial.disconnect();
      });
    }

    // ปุ่มโหมดจำลอง (Virtual Simulation)
    const simBtn = document.getElementById('host-btn-sim-serial');
    if (simBtn) {
      simBtn.addEventListener('click', () => {
        this.serial.enableSimulationMode();
      });
    }

    // ปุ่มสุ่มรหัสห้องใหม่
    const refreshRoomBtn = document.getElementById('host-btn-refresh-room');
    if (refreshRoomBtn) {
      refreshRoomBtn.addEventListener('click', () => {
        if (confirm('ต้องการสุ่มรหัสห้องใหม่หรือไม่? Controller เดิมจะต้องต่อใหม่')) {
          this.regenerateRoom();
        }
      });
    }

    // ปุ่มล้าง Log
    const clearLogBtn = document.getElementById('host-btn-clear-log');
    if (clearLogBtn) {
      clearLogBtn.addEventListener('click', () => {
        const logBox = document.getElementById('host-serial-log-box');
        if (logBox) logBox.innerHTML = '';
      });
    }

    // ปุ่มคัดลอกลิงก์ห้องสำหรับส่งให้นักเรียน
    const copyLinkBtn = document.getElementById('host-btn-copy-room');
    if (copyLinkBtn) {
      copyLinkBtn.addEventListener('click', () => {
        const url = new URL(window.location.href);
        url.hash = `controller?room=${this.roomCode}`;
        navigator.clipboard.writeText(url.toString()).then(() => {
          const originalText = copyLinkBtn.innerHTML;
          copyLinkBtn.innerHTML = '✓ คัดลอกลิงก์แล้ว!';
          setTimeout(() => copyLinkBtn.innerHTML = originalText, 2000);
        });
      });
    }

    // ปุ่มทดสอบส่ง Test Frame
    const testSendBtn = document.getElementById('host-btn-test-send');
    if (testSendBtn) {
      testSendBtn.addEventListener('click', () => {
        this.serial.sendAngles(90, 90, 90, 90);
      });
    }
  }
}

window.HostController = HostController;
