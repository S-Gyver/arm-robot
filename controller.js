/**
 * Mobile Controller Logic for 4-Axis Robot Arm
 * Features: Room Pairing, 4 Large Touch Sliders, 60ms Throttled Realtime Broadcast,
 * Quick Action buttons (Home, Grab/Release, E-Stop), and Haptic Feedback.
 */

class MobileArmController {
  constructor(options = {}) {
    this.containerId = options.containerId || 'controller-view';
    this.roomCode = '';
    this.channel = null;
    this.isConnected = false;
    this.isEmergencyStopped = false;

    // Default Arm Angles
    this.angles = { ...window.ArmConfig.ROBOT_HOME };

    // Throttling mechanism (60ms)
    this.lastSendTime = 0;
    this.throttleInterval = 60; // ms
    this.pendingSendTimer = null;
    this.latencyMs = 0;

    this.init();
  }

  init() {
    this.bindControls();
    this.checkUrlForRoomCode();
    this.updateSlidersUI();
  }

  checkUrlForRoomCode() {
    // ตรวจสอบ Room Code จาก URL hash (เช่น #controller?room=5921)
    try {
      const hash = window.location.hash;
      if (hash.includes('room=')) {
        const match = hash.match(/room=(\d{4})/);
        if (match && match[1]) {
          const pinInput = document.getElementById('ctrl-pin-input');
          if (pinInput) pinInput.value = match[1];
          this.connectToRoom(match[1]);
        }
      }
    } catch (e) {
      console.warn('Could not parse room from URL', e);
    }
  }

  /**
   * เชื่อมต่อไปยัง Supabase Channel ของห้องหุ่นยนต์
   */
  connectToRoom(code) {
    if (!code || code.length !== 4) {
      alert('กรุณากรอกรหัส PIN 4 หลักของห้องให้ถูกต้อง');
      return;
    }

    this.supabase = window.ArmConfig.createSupabaseClient();
    if (!this.supabase) {
      alert('ไม่สามารถเชื่อมต่อ Supabase Client ได้');
      return;
    }

    this.roomCode = code;
    this.updateConnectionStatus('connecting', `กำลังเชื่อมต่อไปยังห้อง #${code}...`);

    if (this.channel) {
      try {
        this.supabase.removeChannel(this.channel);
      } catch (e) { /* ignore */ }
    }

    // เปิด BroadcastChannel สำหรับเครื่องเดียวกัน
    if ('BroadcastChannel' in window) {
      try {
        if (this.localBroadcastChannel) this.localBroadcastChannel.close();
        this.localBroadcastChannel = new BroadcastChannel(`robot-room-bc-${this.roomCode}`);
      } catch (e) { /* ignore */ }
    }

    const channelName = `robot-room-${this.roomCode}`;
    this.channel = this.supabase.channel(channelName, {
      config: {
        broadcast: { ack: false, self: true }
      }
    });

    this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        this.isConnected = true;
        this.isEmergencyStopped = false;
        this.updateConnectionStatus('connected', `เชื่อมต่อห้อง #${this.roomCode} สำเร็จ`);
        this.vibrate(50);

        // ส่งสัญญาณบอก Host ว่ามี Controller เข้ามา
        this.channel.send({
          type: 'broadcast',
          event: 'client_joined',
          payload: { sender: 'Mobile Controller' }
        });

        // ส่งค่ามุมปัจจุบันไปซิงก์กับ Host ทันที
        this.sendAnglesImmediate();

        // แสดงหน้าจอควบคุม ซ่อนหน้าจอกรอกรหัส
        this.togglePairingScreens(true);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // แม้ Supabase จะมีปัญหา ให้เปิดการควบคุมแบบ Local ให้ใช้งานได้ใน Split View
        this.isConnected = true;
        this.updateConnectionStatus('connected', `เชื่อมต่อห้อง #${this.roomCode} (Local Bridge)`);
        this.togglePairingScreens(true);
      }
    });
  }

  disconnectFromRoom() {
    if (this.channel && this.supabase) {
      try {
        this.supabase.removeChannel(this.channel);
      } catch (e) { /* ignore */ }
      this.channel = null;
    }
    if (this.localBroadcastChannel) {
      try {
        this.localBroadcastChannel.close();
        this.localBroadcastChannel = null;
      } catch (e) { /* ignore */ }
    }
    this.isConnected = false;
    this.updateConnectionStatus('disconnected', 'ตัดการเชื่อมต่อแล้ว');
    this.togglePairingScreens(false);
  }

  /**
   * ส่งข้อมูลมุมองศาแบบ Throttled (ทุก 60ms) เพื่อความลื่นไหลและป้องกัน Network Flooding
   */
  queueSendAngles() {
    if (!this.isConnected || this.isEmergencyStopped) return;

    const now = performance.now();
    const elapsed = now - this.lastSendTime;

    if (elapsed >= this.throttleInterval) {
      this.sendAnglesImmediate();
      this.lastSendTime = now;
    } else {
      // ตั้งเวลาส่งรอบถัดไปอัตโนมัติหากยังไม่ถึงเวลา
      if (!this.pendingSendTimer) {
        this.pendingSendTimer = setTimeout(() => {
          this.pendingSendTimer = null;
          this.sendAnglesImmediate();
          this.lastSendTime = performance.now();
        }, this.throttleInterval - elapsed);
      }
    }
  }

  /**
   * ส่งคำสั่งทันที (เช่น เมื่อปล่อยนิ้ว หรือกดปุ่ม Action)
   */
  sendAnglesImmediate() {
    if (!this.isConnected) return;

    if (this.pendingSendTimer) {
      clearTimeout(this.pendingSendTimer);
      this.pendingSendTimer = null;
    }

    const payload = {
      base: Math.round(this.angles.base),
      shoulder: Math.round(this.angles.shoulder),
      elbow: Math.round(this.angles.elbow),
      gripper: Math.round(this.angles.gripper),
      timestamp: Date.now()
    };

    // 1. ส่งผ่าน Supabase Realtime Broadcast ไปยังคอมพิวเตอร์/เครื่องอื่น
    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'arm_command',
        payload: payload
      });
    }

    // 2. ส่งผ่าน BroadcastChannel สำหรับเปิดคนละ Tab ในคอมพิวเตอร์เครื่องเดียวกัน
    if (this.localBroadcastChannel) {
      try {
        this.localBroadcastChannel.postMessage({
          type: 'arm_command',
          payload: payload
        });
      } catch (e) { /* ignore */ }
    }

    // 3. ส่งผ่าน CustomEvent ทันที สำหรับโหมด Split View ในหน้าต่างเดียวกัน (0ms latency)
    window.dispatchEvent(new CustomEvent('robot_arm_direct_command', {
      detail: {
        roomCode: this.roomCode,
        payload: payload
      }
    }));

    // ไฟกระพริบ TX indicator บน Mobile
    const txIndicator = document.getElementById('ctrl-tx-indicator');
    if (txIndicator) {
      txIndicator.classList.add('bg-cyan-400');
      setTimeout(() => txIndicator.classList.remove('bg-cyan-400'), 40);
    }
  }

  /**
   * ปุ่ม Quick Action: Home Position (ทุกแกน 90°)
   */
  actionHome() {
    this.vibrate([30, 40, 30]);
    this.angles.base = 90;
    this.angles.shoulder = 90;
    this.angles.elbow = 90;
    this.angles.gripper = 90;
    this.updateSlidersUI();
    this.sendAnglesImmediate();
  }

  /**
   * ปุ่ม Quick Action: Grab / Release (สลับ Gripper ระหว่าง 0° และ 180°)
   */
  actionToggleGrab() {
    this.vibrate(40);
    // ถ้าเกิน 90 องศาถือว่าคีบอยู่ ให้ปล่อย (0) ไม่งั้นให้คีบแน่น (180)
    if (this.angles.gripper >= 90) {
      this.angles.gripper = 0; // ปล่อย
    } else {
      this.angles.gripper = 180; // คีบแน่น
    }
    this.updateSlidersUI();
    this.sendAnglesImmediate();
  }

  /**
   * ปุ่ม Emergency Stop
   */
  actionEmergencyStop() {
    this.vibrate([80, 50, 80, 50, 100]);
    this.isEmergencyStopped = true;

    if (this.channel && this.isConnected) {
      this.channel.send({
        type: 'broadcast',
        event: 'emergency_stop',
        payload: { at: Date.now() }
      });
    }

    if (this.localBroadcastChannel) {
      try {
        this.localBroadcastChannel.postMessage({ type: 'emergency_stop' });
      } catch (e) { /* ignore */ }
    }

    const modal = document.getElementById('ctrl-estop-modal');
    if (modal) modal.classList.remove('hidden');
  }

  resumeFromEmergencyStop() {
    this.isEmergencyStopped = false;
    const modal = document.getElementById('ctrl-estop-modal');
    if (modal) modal.classList.add('hidden');
    this.actionHome();
  }

  updateSlidersUI() {
    const keys = ['base', 'shoulder', 'elbow', 'gripper'];
    keys.forEach(k => {
      const slider = document.getElementById(`ctrl-slider-${k}`);
      const valText = document.getElementById(`ctrl-val-${k}`);
      if (slider) slider.value = this.angles[k];
      if (valText) valText.textContent = `${Math.round(this.angles[k])}°`;
    });

    // ปรับเปลี่ยนข้อความปุ่ม Grab / Release ตามองศา
    const grabBtnText = document.getElementById('ctrl-btn-grab-text');
    if (grabBtnText) {
      if (this.angles.gripper >= 90) {
        grabBtnText.textContent = 'Release (ปล่อย)';
      } else {
        grabBtnText.textContent = 'Grab (คีบ)';
      }
    }
  }

  updateConnectionStatus(status, text) {
    const statusPill = document.getElementById('ctrl-status-pill');
    const statusText = document.getElementById('ctrl-status-text');
    const roomHeaderBadge = document.getElementById('ctrl-header-room-badge');

    if (status === 'connected') {
      if (statusPill) statusPill.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5';
      if (statusText) statusText.textContent = text;
      if (roomHeaderBadge) roomHeaderBadge.textContent = `ROOM #${this.roomCode}`;
    } else if (status === 'connecting') {
      if (statusPill) statusPill.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 animate-pulse';
      if (statusText) statusText.textContent = text;
    } else {
      if (statusPill) statusPill.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1.5';
      if (statusText) statusText.textContent = text;
    }
  }

  togglePairingScreens(isConnected) {
    const pairingCard = document.getElementById('ctrl-pairing-card');
    const controlsPanel = document.getElementById('ctrl-active-controls');

    if (isConnected) {
      if (pairingCard) pairingCard.classList.add('hidden');
      if (controlsPanel) controlsPanel.classList.remove('hidden');
    } else {
      if (pairingCard) pairingCard.classList.remove('hidden');
      if (controlsPanel) controlsPanel.classList.add('hidden');
    }
  }

  vibrate(pattern) {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (e) { /* ignore */ }
    }
  }

  bindControls() {
    // 1. ปุ่ม Pair กับห้อง
    const pairBtn = document.getElementById('ctrl-btn-pair');
    const pinInput = document.getElementById('ctrl-pin-input');
    if (pairBtn && pinInput) {
      pairBtn.addEventListener('click', () => {
        this.connectToRoom(pinInput.value.trim());
      });
      pinInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.connectToRoom(pinInput.value.trim());
        }
      });
    }

    // ปุ่ม Disconnect
    const disconnectBtn = document.getElementById('ctrl-btn-disconnect');
    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', () => {
        if (confirm('ต้องการตัดการเชื่อมต่อจากห้องนี้หรือไม่?')) {
          this.disconnectFromRoom();
        }
      });
    }

    // 2. ผูก Event Sliders ทั้ง 4 แกน
    const keys = ['base', 'shoulder', 'elbow', 'gripper'];
    keys.forEach(k => {
      const slider = document.getElementById(`ctrl-slider-${k}`);
      if (slider) {
        // ขณะลาก (Input Event)
        slider.addEventListener('input', (e) => {
          this.angles[k] = Number(e.target.value);
          const valText = document.getElementById(`ctrl-val-${k}`);
          if (valText) valText.textContent = `${this.angles[k]}°`;
          this.queueSendAngles();
        });

        // เมื่อปล่อยนิ้ว (Change Event)
        slider.addEventListener('change', () => {
          this.vibrate(10);
          this.sendAnglesImmediate();
        });
      }

      // ปุ่มจูนละเอียด (+1° / -1°)
      const btnMinus = document.getElementById(`ctrl-btn-${k}-minus`);
      const btnPlus = document.getElementById(`ctrl-btn-${k}-plus`);

      if (btnMinus) {
        btnMinus.addEventListener('click', () => {
          this.vibrate(8);
          this.angles[k] = Math.max(0, this.angles[k] - 2);
          this.updateSlidersUI();
          this.sendAnglesImmediate();
        });
      }

      if (btnPlus) {
        btnPlus.addEventListener('click', () => {
          this.vibrate(8);
          this.angles[k] = Math.min(180, this.angles[k] + 2);
          this.updateSlidersUI();
          this.sendAnglesImmediate();
        });
      }
    });

    // 3. ปุ่ม Quick Action
    const btnHome = document.getElementById('ctrl-btn-home');
    if (btnHome) btnHome.addEventListener('click', () => this.actionHome());

    const btnGrab = document.getElementById('ctrl-btn-grab');
    if (btnGrab) btnGrab.addEventListener('click', () => this.actionToggleGrab());

    const btnEstop = document.getElementById('ctrl-btn-estop');
    if (btnEstop) btnEstop.addEventListener('click', () => this.actionEmergencyStop());

    const btnResumeEstop = document.getElementById('ctrl-btn-resume-estop');
    if (btnResumeEstop) btnResumeEstop.addEventListener('click', () => this.resumeFromEmergencyStop());
  }
}

window.MobileArmController = MobileArmController;
