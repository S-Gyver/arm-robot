/**
 * Mobile Controller Logic for Multi-Axis Robot Arm
 * Features:
 * - Dynamic 2, 3, 4, 5, and 6 Servo Support
 * - Room Pairing via Supabase Realtime & Local BroadcastChannel
 * - Responsive Large Touch Sliders with Fine-tuning (-/+)
 * - 60ms Throttled Realtime Broadcast
 * - Quick Action buttons (Home, Grab/Release, E-Stop) & Haptic Feedback
 */

class MobileArmController {
  constructor(options = {}) {
    this.containerId = options.containerId || 'controller-view';
    this.roomCode = '';
    this.channel = null;
    this.isConnected = false;
    this.isEmergencyStopped = false;

    // โหลดจำนวน Servo เริ่มต้น (2, 3, 4, 5 หรือ 6)
    this.servoCount = window.ArmConfig ? window.ArmConfig.getCurrentServoCount() : 4;
    this.angles = window.ArmConfig ? window.ArmConfig.getDefaultAngles(this.servoCount) : { base: 90, shoulder: 90, elbow: 90, gripper: 90 };

    // Throttling mechanism (60ms)
    this.lastSendTime = 0;
    this.throttleInterval = 60; // ms
    this.pendingSendTimer = null;

    window.ctrlApp = this;
    window.addEventListener('robot_gripper_calibration_change', () => this.onCalibrationChange());
    window.addEventListener('robot_calibration_change', () => this.onCalibrationChange());

    this.init();
  }

  onCalibrationChange() {
    const allCalib = window.ArmConfig ? window.ArmConfig.getAllCalibration() : {};
    const cfg = window.ArmConfig ? window.ArmConfig.getServoConfig(this.servoCount) : null;
    if (cfg && cfg.axes) {
      cfg.axes.forEach(axis => {
        const c = allCalib[axis.key];
        if (c && this.angles[axis.key] !== undefined) {
          this.angles[axis.key] = Math.max(c.min, Math.min(c.max, this.angles[axis.key]));
        }
      });
    }
    this.renderSliders();
    this.updateSlidersUI();
    this.sendAnglesImmediate();
  }

  init() {
    this.renderSliders();
    this.bindControls();
    this.checkUrlForRoomCode();
    this.updateSlidersUI();
    this.updateServoSelectorUI();
    this.setupLocalFallbackBridge();
  }

  checkUrlForRoomCode() {
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
   * สลับจำนวน Servo (2, 3, 4, 5, 6)
   */
  setServoCount(count, broadcast = true) {
    const n = parseInt(count, 10);
    if (![2, 3, 4, 5, 6].includes(n)) return;

    this.servoCount = n;
    if (window.ArmConfig) {
      window.ArmConfig.setCurrentServoCount(n);
      this.angles = window.ArmConfig.getDefaultAngles(n);
    }

    this.renderSliders();
    this.updateSlidersUI();
    this.updateServoSelectorUI();
    this.vibrate(40);

    if (broadcast && this.isConnected) {
      this.broadcastConfig();
      this.sendAnglesImmediate();
    }
  }

  broadcastConfig() {
    const payload = {
      servoCount: this.servoCount,
      config: window.ArmConfig ? window.ArmConfig.getServoConfig(this.servoCount) : null
    };

    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'config_change',
        payload: payload
      });
    }

    if (this.localBroadcastChannel) {
      try {
        this.localBroadcastChannel.postMessage({
          type: 'config_change',
          payload: payload
        });
      } catch (e) { /* ignore */ }
    }

    window.dispatchEvent(new CustomEvent('robot_arm_config_change', {
      detail: { roomCode: this.roomCode, payload }
    }));
  }

  /**
   * อัปเดตสถานะปุ่มเลือกจำนวน Servo ใน Controller
   */
  updateServoSelectorUI() {
    const buttons = document.querySelectorAll('.ctrl-servo-btn');
    buttons.forEach(btn => {
      const count = parseInt(btn.getAttribute('data-servo-count'), 10);
      if (count === this.servoCount) {
        btn.className = 'ctrl-servo-btn px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/25 border border-cyan-400/40';
      } else {
        btn.className = 'ctrl-servo-btn px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-all border border-transparent';
      }
    });

    const badge = document.getElementById('ctrl-servo-mode-badge');
    if (badge) {
      badge.textContent = `${this.servoCount} SERVOS`;
    }
  }

  /**
   * สร้าง Sliders บนหน้าจอควบคุมตามจำนวนแกนที่มี
   */
  renderSliders() {
    const container = document.getElementById('ctrl-sliders-container');
    if (!container) return;

    const cfg = window.ArmConfig ? window.ArmConfig.getServoConfig(this.servoCount) : null;
    if (!cfg || !cfg.axes) return;

    const colorMap = {
      blue: { border: 'border-blue-500/20', text: 'text-blue-400', valText: 'text-blue-300', sliderClass: 'slider-blue' },
      purple: { border: 'border-purple-500/20', text: 'text-purple-400', valText: 'text-purple-300', sliderClass: 'slider-purple' },
      cyan: { border: 'border-cyan-500/20', text: 'text-cyan-400', valText: 'text-cyan-300', sliderClass: 'slider-cyan' },
      amber: { border: 'border-amber-500/20', text: 'text-amber-400', valText: 'text-amber-300', sliderClass: 'slider-amber' },
      rose: { border: 'border-rose-500/20', text: 'text-rose-400', valText: 'text-rose-300', sliderClass: 'slider-rose' },
      emerald: { border: 'border-emerald-500/20', text: 'text-emerald-400', valText: 'text-emerald-300', sliderClass: 'slider-emerald' }
    };

    const allCalib = window.ArmConfig ? window.ArmConfig.getAllCalibration() : {};

    container.innerHTML = '';

    cfg.axes.forEach((axis, index) => {
      const c = allCalib[axis.key] || { min: axis.min || 0, max: axis.max || 180, home: 90, inverted: false };
      const isGripper = axis.isGripper || axis.key === 'gripper';
      const axisMin = c.min;
      const axisMax = c.max;

      const colorMapItem = colorMap[axis.color] || colorMap.blue;
      let initialVal = this.angles[axis.key] !== undefined ? Math.round(this.angles[axis.key]) : (c.home || axis.default || 90);
      initialVal = Math.max(axisMin, Math.min(axisMax, initialVal));
      this.angles[axis.key] = initialVal;

      const calibBtnHtml = `
        <button type="button" onclick="openCalibrationModal('${axis.key}')" class="px-2 py-0.5 rounded-lg bg-slate-800/80 hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-300 border border-white/10 text-[10px] flex items-center gap-1 font-sans font-semibold transition active:scale-95 shadow-sm" title="ตั้งค่าและปรับเทียบแกน ${axis.name}">
          <i data-lucide="settings-2" class="w-3 h-3"></i>
          <span>Calibrate</span>
        </button>
      `;

      const minLabel = isGripper 
        ? `${axisMin}° ${c.inverted ? 'หนีบ' : 'อ้าสุด'}` 
        : `${axisMin}° ${c.inverted ? 'Max' : 'Min'}`;
      const midLabel = `Home: ${c.home}°`;
      const maxLabel = isGripper 
        ? `${axisMax}° ${c.inverted ? 'อ้าสุด' : 'หนีบแน่น'}` 
        : `${axisMax}° ${c.inverted ? 'Min' : 'Max'}`;

      const card = document.createElement('div');
      card.className = `space-y-1.5 bg-slate-900/60 p-3.5 rounded-xl border ${colorMapItem.border}`;
      card.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <label class="text-xs font-bold ${colorMapItem.text} flex items-center gap-1.5">
              <i data-lucide="${axis.icon || 'sliders'}" class="w-3.5 h-3.5"></i>
              <span>${axis.name}</span>
              <span class="text-[11px] font-normal text-slate-400">(${axis.nameTh})</span>
            </label>
            ${calibBtnHtml}
          </div>
          <div class="flex items-center gap-1">
            <button id="ctrl-btn-${axis.key}-minus" class="w-7 h-7 rounded-lg bg-slate-800 text-slate-200 text-xs font-bold hover:bg-slate-700 active:scale-95 transition">-</button>
            <span id="ctrl-val-${axis.key}" class="w-12 text-center font-mono-tech font-bold ${colorMapItem.valText} text-sm">${initialVal}°</span>
            <button id="ctrl-btn-${axis.key}-plus" class="w-7 h-7 rounded-lg bg-slate-800 text-slate-200 text-xs font-bold hover:bg-slate-700 active:scale-95 transition">+</button>
          </div>
        </div>
        <input id="ctrl-slider-${axis.key}" type="range" min="${axisMin}" max="${axisMax}" value="${initialVal}" class="touch-slider ${colorMapItem.sliderClass}">
        <div class="flex justify-between text-[10px] text-slate-500 px-0.5 font-mono-tech">
          <span>${minLabel}</span>
          <span>${midLabel}</span>
          <span>${maxLabel}</span>
        </div>
      `;
      container.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
    this.bindSliderEvents();
  }

  bindSliderEvents() {
    const cfg = window.ArmConfig ? window.ArmConfig.getServoConfig(this.servoCount) : null;
    if (!cfg || !cfg.axes) return;

    const allCalib = window.ArmConfig ? window.ArmConfig.getAllCalibration() : {};

    cfg.axes.forEach(axis => {
      const c = allCalib[axis.key] || { min: axis.min || 0, max: axis.max || 180, home: 90, inverted: false };
      const axisMin = c.min;
      const axisMax = c.max;
      const step = (axis.isGripper || axis.key === 'gripper') ? 2 : 1;

      const slider = document.getElementById(`ctrl-slider-${axis.key}`);
      const minusBtn = document.getElementById(`ctrl-btn-${axis.key}-minus`);
      const plusBtn = document.getElementById(`ctrl-btn-${axis.key}-plus`);

      if (slider) {
        const handleInput = () => {
          this.angles[axis.key] = Number(slider.value);
          this.updateSlidersUI();
          this.queueSendAngles();
        };
        slider.addEventListener('input', handleInput);
        slider.addEventListener('change', () => {
          this.angles[axis.key] = Number(slider.value);
          this.updateSlidersUI();
          this.sendAnglesImmediate();
        });
      }

      if (minusBtn) {
        minusBtn.addEventListener('click', () => {
          this.vibrate(15);
          this.angles[axis.key] = Math.max(axisMin, (this.angles[axis.key] || 90) - step);
          this.updateSlidersUI();
          this.sendAnglesImmediate();
        });
      }

      if (plusBtn) {
        plusBtn.addEventListener('click', () => {
          this.vibrate(15);
          this.angles[axis.key] = Math.min(axisMax, (this.angles[axis.key] || 90) + step);
          this.updateSlidersUI();
          this.sendAnglesImmediate();
        });
      }
    });
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

    if ('BroadcastChannel' in window) {
      try {
        if (this.localBroadcastChannel) this.localBroadcastChannel.close();
        this.localBroadcastChannel = new BroadcastChannel(`robot-room-bc-${this.roomCode}`);
        this.localBroadcastChannel.onmessage = (event) => {
          if (event.data && event.data.type === 'config_change') {
            if (event.data.payload && event.data.payload.servoCount !== this.servoCount) {
              this.setServoCount(event.data.payload.servoCount, false);
            }
          }
        };
      } catch (e) { /* ignore */ }
    }

    const channelName = `robot-room-${this.roomCode}`;
    this.channel = this.supabase.channel(channelName, {
      config: {
        broadcast: { ack: false, self: true }
      }
    });

    // รับ Event เปลี่ยน Config จาก Host
    this.channel.on('broadcast', { event: 'config_change' }, (payload) => {
      if (payload && payload.payload && payload.payload.servoCount) {
        if (payload.payload.servoCount !== this.servoCount) {
          this.setServoCount(payload.payload.servoCount, false);
        }
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
        this.togglePairingScreens(true);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.isConnected = true;
        this.updateConnectionStatus('connected', `เชื่อมต่อห้อง #${this.roomCode} (Local Bridge)`);
        this.togglePairingScreens(true);
      }
    });
  }

  setupLocalFallbackBridge() {
    if (this._localConfigHandler) {
      window.removeEventListener('robot_arm_config_change', this._localConfigHandler);
    }
    this._localConfigHandler = (e) => {
      if (e.detail && String(e.detail.roomCode) === String(this.roomCode)) {
        if (e.detail.payload && e.detail.payload.servoCount !== this.servoCount) {
          this.setServoCount(e.detail.payload.servoCount, false);
        }
      }
    };
    window.addEventListener('robot_arm_config_change', this._localConfigHandler);
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

  queueSendAngles() {
    if (!this.isConnected || this.isEmergencyStopped) return;

    const now = performance.now();
    const elapsed = now - this.lastSendTime;

    if (elapsed >= this.throttleInterval) {
      this.sendAnglesImmediate();
      this.lastSendTime = now;
    } else {
      if (!this.pendingSendTimer) {
        this.pendingSendTimer = setTimeout(() => {
          this.pendingSendTimer = null;
          this.sendAnglesImmediate();
          this.lastSendTime = performance.now();
        }, this.throttleInterval - elapsed);
      }
    }
  }

  sendAnglesImmediate() {
    if (!this.isConnected) return;

    if (this.pendingSendTimer) {
      clearTimeout(this.pendingSendTimer);
      this.pendingSendTimer = null;
    }

    const payload = {
      ...this.angles,
      servoCount: this.servoCount,
      timestamp: Date.now()
    };

    // 1. Supabase Realtime Broadcast
    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'arm_command',
        payload: payload
      });
    }

    // 2. BroadcastChannel
    if (this.localBroadcastChannel) {
      try {
        this.localBroadcastChannel.postMessage({
          type: 'arm_command',
          payload: payload
        });
      } catch (e) { /* ignore */ }
    }

    // 3. CustomEvent
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
   * ปุ่ม Quick Action: Home Position (อิงตามค่า Calibrate Home ของแต่ละแกน)
   */
  actionHome() {
    this.vibrate([30, 40, 30]);
    const cfg = window.ArmConfig ? window.ArmConfig.getServoConfig(this.servoCount) : null;
    const defaultAngles = window.ArmConfig ? window.ArmConfig.getDefaultAngles(this.servoCount) : null;
    if (cfg && cfg.axes) {
      cfg.axes.forEach(axis => {
        this.angles[axis.key] = (defaultAngles && defaultAngles[axis.key] !== undefined)
          ? defaultAngles[axis.key]
          : (axis.default !== undefined ? axis.default : 90);
      });
    }
    this.updateSlidersUI();
    this.sendAnglesImmediate();
  }

  /**
   * ปุ่ม Quick Action: Grab / Release (สลับ Gripper ระหว่าง 0° และ 180°)
   */
  actionToggleGrab() {
    this.vibrate(40);
    const cfg = window.ArmConfig ? window.ArmConfig.getServoConfig(this.servoCount) : null;
    let gripperKey = 'gripper';
    if (cfg && cfg.axes) {
      const gripperAxis = cfg.axes.find(a => a.isGripper) || cfg.axes[cfg.axes.length - 1];
      if (gripperAxis) gripperKey = gripperAxis.key;
    }

    const calib = window.ArmConfig ? window.ArmConfig.getGripperCalibration() : { release: 30, grab: 140 };
    const currentVal = this.angles[gripperKey] !== undefined ? this.angles[gripperKey] : 90;

    // สลับระหว่าง release และ grab ตามค่า calibration
    if (Math.abs(currentVal - calib.grab) < Math.abs(currentVal - calib.release)) {
      this.angles[gripperKey] = calib.release; // ปล่อย
    } else {
      this.angles[gripperKey] = calib.grab; // คีบแน่น
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
    const cfg = window.ArmConfig ? window.ArmConfig.getServoConfig(this.servoCount) : null;
    if (!cfg || !cfg.axes) return;

    let gripperKey = 'gripper';
    cfg.axes.forEach(axis => {
      if (axis.isGripper) gripperKey = axis.key;
      const slider = document.getElementById(`ctrl-slider-${axis.key}`);
      const valText = document.getElementById(`ctrl-val-${axis.key}`);
      const val = this.angles[axis.key] !== undefined ? Math.round(this.angles[axis.key]) : 90;
      if (slider) slider.value = val;
      if (valText) valText.textContent = `${val}°`;
    });

    // ปรับเปลี่ยนข้อความปุ่ม Grab / Release ตามองศา
    const grabBtnText = document.getElementById('ctrl-btn-grab-text');
    if (grabBtnText) {
      const gripperVal = this.angles[gripperKey] !== undefined ? this.angles[gripperKey] : 90;
      if (gripperVal >= 90) {
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

    // Quick Actions
    const homeBtn = document.getElementById('ctrl-btn-home');
    if (homeBtn) {
      homeBtn.addEventListener('click', () => this.actionHome());
    }

    const grabBtn = document.getElementById('ctrl-btn-grab');
    if (grabBtn) {
      grabBtn.addEventListener('click', () => this.actionToggleGrab());
    }

    const estopBtn = document.getElementById('ctrl-btn-estop');
    if (estopBtn) {
      estopBtn.addEventListener('click', () => this.actionEmergencyStop());
    }

    const resumeEstopBtn = document.getElementById('ctrl-btn-resume-estop');
    if (resumeEstopBtn) {
      resumeEstopBtn.addEventListener('click', () => this.resumeFromEmergencyStop());
    }

    // ปุ่มเลือกจำนวน Servo
    const servoButtons = document.querySelectorAll('.ctrl-servo-btn');
    servoButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const count = parseInt(btn.getAttribute('data-servo-count'), 10);
        if ([2, 3, 4, 5, 6].includes(count)) {
          this.setServoCount(count, true);
        }
      });
    });
  }
}

window.MobileArmController = MobileArmController;
