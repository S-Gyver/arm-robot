/**
 * PC Host View Logic
 * Handles Room Code generation, Web Serial API connection with ESP32,
 * Supabase Realtime subscription, 3D WebGL / 2D Canvas kinematic telemetry,
 * Onboard PC Sliders, and Serial TX logging.
 * Supports 2, 3, 4, 5, and 6 Servos configurations.
 */

class HostController {
  constructor(options = {}) {
    this.containerId = options.containerId || 'host-view';
    this.roomCode = this.generateRoomCode();
    this.channel = null;
    this.serial = null;
    this.visualizer = null;
    this.visualizer3D = null;
    
    // โหลดจำนวน Servo เริ่มต้น (2, 3, 4, 5 หรือ 6)
    this.servoCount = window.ArmConfig ? window.ArmConfig.getCurrentServoCount() : 6;
    this.angles = window.ArmConfig ? window.ArmConfig.getDefaultAngles(this.servoCount) : { base: 90, shoulder: 90, elbow: 90, wristPitch: 90, wristRoll: 90, gripper: 90 };

    this.txCount = 0;
    this.rxCount = 0;
    this.connectedClientsCount = 0;
    this.simMode = '3d'; // ค่าเริ่มต้นเป็น 3D
    this.isGripperClosed = false;
    this.lastBroadcastTime = 0;
    this.lastSerialSendTime = 0;
    this.serialThrottleTimer = null;
    this.smoothAnimTimer = null;
    this.danceTimer = null;
    this.isDancing = false;

    window.hostApp = this;
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
    this.updateTelemetryUI();
    if (this.visualizer3D) this.visualizer3D.setAngles(this.angles);
    if (this.visualizer) this.visualizer.setAngles(this.angles);
    this.sendAnglesImmediate();
  }

  generateRoomCode() {
    // สุ่มรหัส 4 หลัก เช่น 7188
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  init() {
    this.setupVisualizer();
    this.setupSerial();
    this.setupSupabaseChannel();
    this.renderSliders();
    this.renderTelemetryGauges();
    this.updateTelemetryUI();
    this.updateRoomDisplay();
    this.updateServoSelectorUI();
    this.bindUIEvents();
  }

  setupVisualizer() {
    // 1. 3D WebGL Visualizer
    const container3D = document.getElementById('host-robot-3d-container');
    if (container3D && window.RobotArm3D) {
      this.visualizer3D = new window.RobotArm3D('host-robot-3d-container', this.servoCount);
      this.visualizer3D.setAngles(this.angles);
    }

    // 2. 2D Fallback Visualizer
    const canvas2D = document.getElementById('host-robot-canvas');
    if (canvas2D && window.RobotArmVisualizer) {
      this.visualizer = new window.RobotArmVisualizer('host-robot-canvas', this.servoCount);
      this.visualizer.setAngles(this.angles);
    }
  }

  switchSimMode(mode) {
    this.simMode = mode;
    const box3D = document.getElementById('host-sim-3d-box');
    const box2D = document.getElementById('host-sim-2d-box');
    const btn3D = document.getElementById('btn-sim-mode-3d');
    const btn2D = document.getElementById('btn-sim-mode-2d');

    if (mode === '3d') {
      if (box3D) box3D.classList.remove('hidden');
      if (box2D) box2D.classList.add('hidden');
      if (btn3D) btn3D.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-600 text-white shadow-md transition flex items-center gap-1.5';
      if (btn2D) btn2D.className = 'px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition flex items-center gap-1.5';
      if (this.visualizer3D) setTimeout(() => this.visualizer3D.onResize(), 60);
    } else {
      if (box3D) box3D.classList.add('hidden');
      if (box2D) box2D.classList.remove('hidden');
      if (btn3D) btn3D.className = 'px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition flex items-center gap-1.5';
      if (btn2D) btn2D.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-md transition flex items-center gap-1.5';
      if (this.visualizer) setTimeout(() => this.visualizer.resize(), 60);
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
   * เปลี่ยนจำนวน Servo (2, 3, 4, 5, 6)
   */
  setServoCount(count, broadcast = true) {
    const n = parseInt(count, 10);
    if (![2, 3, 4, 5, 6].includes(n)) return;

    this.servoCount = n;
    if (window.ArmConfig) {
      window.ArmConfig.setCurrentServoCount(n);
      this.angles = window.ArmConfig.getDefaultAngles(n);
    }

    // อัปเดตกราฟิก 3D และ 2D Kinematics
    if (this.visualizer3D) {
      this.visualizer3D.setServoCount(n);
      this.visualizer3D.setAngles(this.angles);
    }
    if (this.visualizer) {
      this.visualizer.setServoCount(n);
      this.visualizer.setAngles(this.angles);
    }

    // อัปเดต UI Sliders, Selector และ Gauges
    this.renderSliders();
    this.updateServoSelectorUI();
    this.renderTelemetryGauges();
    this.updateTelemetryUI();

    this.appendSerialLog({
      timestamp: new Date().toLocaleTimeString(),
      message: `🔧 เปลี่ยนโหมดหุ่นยนต์เป็น ${n} Servos (${window.ArmConfig.getServoConfig(n).name})`,
      type: 'info'
    });

    // ซิงก์จำนวน Servo ไปยัง Mobile Controller ทันที
    if (broadcast) {
      this.broadcastConfig();
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
   * สร้าง Sliders สำหรับควบคุมใน PC Host View (Middle Column)
   */
  renderSliders() {
    const container = document.getElementById('host-sliders-container');
    if (!container) return;

    const cfg = window.ArmConfig ? window.ArmConfig.getServoConfig(this.servoCount) : null;
    if (!cfg || !cfg.axes) return;

    container.innerHTML = '';

    const colorThumbMap = {
      blue: 'slider-blue',
      purple: 'slider-purple',
      cyan: 'slider-cyan',
      amber: 'slider-amber',
      rose: 'slider-rose',
      emerald: 'slider-emerald'
    };

    const allCalib = window.ArmConfig ? window.ArmConfig.getAllCalibration() : {};

    // ป้ายข้อความบอกทิศทางภาษาไทย
    const axisLabelsMap = {
      base: { minDesc: 'ซ้ายสุด', maxDesc: 'ขวาสุด', icon: 'rotate-cw' },
      shoulder: { minDesc: 'ก้มต่ำสุด', maxDesc: 'เงยสูงสุด', icon: 'move-vertical' },
      elbow: { minDesc: 'พับเข้างอสุด', maxDesc: 'เหยียดออกตรงสุด', icon: 'corner-down-right' },
      wristPitch: { minDesc: 'ก้มลึกสุด', maxDesc: 'เงยสูงสุด', icon: 'activity' },
      wristRoll: { minDesc: 'บิดซ้ายสุด', maxDesc: 'บิดขวาสุด', icon: 'refresh-cw' },
      gripper: { minDesc: 'อ้าสุด', maxDesc: 'หนีบแน่น', icon: 'scissors' }
    };

    const isCompact = this.servoCount >= 5;
    container.className = isCompact 
      ? 'flex-1 flex flex-col justify-between py-1 space-y-1.5' 
      : 'flex-1 flex flex-col justify-around py-1 space-y-2.5 sm:space-y-3';

    cfg.axes.forEach((axis) => {
      const c = allCalib[axis.key] || { min: axis.min || 0, max: axis.max || 180, home: 90, inverted: false };
      const axisMin = c.min;
      const axisMax = c.max;
      const isGripper = axis.isGripper || axis.key === 'gripper';
      
      let val = this.angles[axis.key] !== undefined ? Math.round(this.angles[axis.key]) : (c.home || axis.default || 90);
      val = Math.max(axisMin, Math.min(axisMax, val));
      this.angles[axis.key] = val;

      const thumbClass = colorThumbMap[axis.color] || 'slider-cyan';
      const meta = axisLabelsMap[axis.key] || { minDesc: 'Min', maxDesc: 'Max', icon: axis.icon || 'circle-dot' };
      
      const minText = isGripper 
        ? `${axisMin}° ${c.inverted ? 'หนีบ' : 'อ้าสุด'}` 
        : `${axisMin}° ${c.inverted ? meta.maxDesc : meta.minDesc}`;
      const maxText = isGripper 
        ? `${axisMax}° ${c.inverted ? 'อ้าสุด' : 'หนีบแน่น'}` 
        : `${axisMax}° ${c.inverted ? meta.minDesc : meta.maxDesc}`;
      const midText = `Home: ${c.home}°`;

      const row = document.createElement('div');
      row.className = isCompact
        ? 'bg-slate-900/60 hover:bg-slate-900/80 px-3 py-1.5 rounded-xl border border-white/5 space-y-1 transition-colors hover:border-white/10'
        : 'bg-slate-900/60 hover:bg-slate-900/80 px-3.5 py-2 sm:py-2.5 rounded-xl border border-white/5 space-y-1.5 transition-colors hover:border-white/10';

      const btnSize = isCompact ? 'w-5 h-5 text-xs' : 'w-6 h-6 text-xs';
      const valBadge = isCompact
        ? `<span id="host-slider-val-${axis.key}" class="font-mono-tech text-[11px] font-bold text-cyan-300 bg-slate-950/90 px-1.5 py-0.5 rounded-md border border-white/15 min-w-[34px] text-center inline-block">${val}°</span>`
        : `<span id="host-slider-val-${axis.key}" class="font-mono-tech text-xs font-bold text-cyan-300 bg-slate-950/90 px-2 py-0.5 rounded-md border border-white/15 min-w-[38px] text-center inline-block">${val}°</span>`;
      const lblFont = isCompact ? 'text-[9px]' : 'text-[10px]';

      const calibBtnHtml = `
        <button type="button" onclick="openCalibrationModal('${axis.key}')" class="px-1.5 py-0.5 rounded-md bg-slate-800/80 hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-300 border border-white/10 text-[10px] flex items-center gap-1 font-sans transition active:scale-95 shadow-sm" title="ตั้งค่าและปรับเทียบแกน ${axis.name}">
          <i data-lucide="settings-2" class="w-3 h-3"></i>
          <span class="hidden sm:inline">Calibrate</span>
        </button>
      `;

      row.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-200">
            <i data-lucide="${meta.icon}" class="w-4 h-4 text-cyan-400"></i>
            <span>${axis.name}</span>
            ${calibBtnHtml}
          </div>
          <div class="flex items-center gap-1">
            <button id="host-btn-dec-${axis.key}" class="${btnSize} rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono-tech flex items-center justify-center font-bold border border-white/10 active:scale-95 transition" title="ลด 5°">-</button>
            ${valBadge}
            <button id="host-btn-inc-${axis.key}" class="${btnSize} rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono-tech flex items-center justify-center font-bold border border-white/10 active:scale-95 transition" title="เพิ่ม 5°">+</button>
          </div>
        </div>
        <div class="px-0.5 flex items-center">
          <input type="range" id="host-slider-${axis.key}" min="${axisMin}" max="${axisMax}" value="${val}" class="host-slider ${thumbClass} w-full">
        </div>
        <div class="flex justify-between ${lblFont} text-slate-400 font-mono-tech px-0.5 leading-none">
          <span>${minText}</span>
          <span>${midText}</span>
          <span>${maxText}</span>
        </div>
      `;
      container.appendChild(row);
    });

    if (window.lucide) window.lucide.createIcons();

    // Bind slider input events and - / + buttons
    cfg.axes.forEach(axis => {
      const c = allCalib[axis.key] || { min: axis.min || 0, max: axis.max || 180, home: 90, inverted: false };
      const axisMin = c.min;
      const axisMax = c.max;
      const isGripper = axis.isGripper || axis.key === 'gripper';
      const step = isGripper ? 2 : 5;

      const slider = document.getElementById(`host-slider-${axis.key}`);
      const btnDec = document.getElementById(`host-btn-dec-${axis.key}`);
      const btnInc = document.getElementById(`host-btn-inc-${axis.key}`);

      if (slider) {
        slider.addEventListener('input', (e) => {
          this.handleSliderChange(axis.key, parseInt(e.target.value, 10), true);
        });
        slider.addEventListener('change', (e) => {
          this.handleSliderChange(axis.key, parseInt(e.target.value, 10), false);
        });
        slider.addEventListener('pointerup', (e) => {
          this.handleSliderChange(axis.key, parseInt(e.target.value, 10), false);
        });
      }
      if (btnDec) {
        btnDec.addEventListener('click', () => {
          const current = this.angles[axis.key] !== undefined ? this.angles[axis.key] : 90;
          const next = Math.max(axisMin, current - step);
          this.handleSliderChange(axis.key, next, false);
        });
      }
      if (btnInc) {
        btnInc.addEventListener('click', () => {
          const current = this.angles[axis.key] !== undefined ? this.angles[axis.key] : 90;
          const next = Math.min(axisMax, current + step);
          this.handleSliderChange(axis.key, next, false);
        });
      }
    });

    const badge = document.getElementById('host-joints-badge');
    if (badge) badge.textContent = `${this.servoCount} SERVOS`;
  }

  handleSliderChange(axisKey, value, isDrag = false) {
    if (this.isDancing) this.stopDance();
    if (this.smoothAnimTimer) {
      clearInterval(this.smoothAnimTimer);
      this.smoothAnimTimer = null;
    }

    const val = Math.max(0, Math.min(180, Math.round(value)));
    this.angles[axisKey] = val;

    // 1. Instantaneous UI updates (0ms delay)
    const slider = document.getElementById(`host-slider-${axisKey}`);
    const valReadout = document.getElementById(`host-slider-val-${axisKey}`);
    if (slider && Number(slider.value) !== val) slider.value = val;
    if (valReadout) valReadout.textContent = `${val}°`;

    // 2. Direct 3D Kinematics update (instant responsive tracking)
    if (this.visualizer3D) this.visualizer3D.setAngles(this.angles);
    if (this.visualizer) this.visualizer.setAngles(this.angles);

    // 3. Fast telemetry update (no DOM recreation)
    const valEl = document.getElementById(`host-val-${axisKey}`);
    const barEl = document.getElementById(`host-bar-${axisKey}`);
    if (valEl) valEl.textContent = `${val}°`;
    if (barEl) barEl.style.width = `${(val / 180) * 100}%`;

    // 4. Throttled Serial & Supabase Broadcast (50ms interval)
    this.sendAnglesThrottled(!isDrag);
    this.broadcastAngles();
  }

  updateSlidersUI() {
    const cfg = window.ArmConfig ? window.ArmConfig.getServoConfig(this.servoCount) : null;
    if (!cfg || !cfg.axes) return;

    cfg.axes.forEach(axis => {
      const val = Math.round(this.angles[axis.key] !== undefined ? this.angles[axis.key] : 90);
      const slider = document.getElementById(`host-slider-${axis.key}`);
      const valReadout = document.getElementById(`host-slider-val-${axis.key}`);
      if (slider && Number(slider.value) !== val) slider.value = val;
      if (valReadout) valReadout.textContent = `${val}°`;
    });
  }

  /**
   * เคลื่อนที่ไปยังชุดมุมองศาเป้าหมายอย่างนุ่มนวล (Smooth Easing Motion)
   * ไม่กระชาก ลดแรงสะบัดของเซอร์โวและจำลองการเคลื่อนที่อย่างสมจริง
   */
  moveToPoseSmooth(targetAngles, duration = 750, onComplete = null) {
    if (this.smoothAnimTimer) {
      clearInterval(this.smoothAnimTimer);
      this.smoothAnimTimer = null;
    }

    const cfg = window.ArmConfig ? window.ArmConfig.getServoConfig(this.servoCount) : null;
    if (!cfg || !cfg.axes) return;

    const startAngles = {};
    const deltaAngles = {};
    let hasMovement = false;

    cfg.axes.forEach(axis => {
      const start = this.angles[axis.key] !== undefined ? this.angles[axis.key] : 90;
      const target = targetAngles[axis.key] !== undefined ? targetAngles[axis.key] : start;
      startAngles[axis.key] = start;
      deltaAngles[axis.key] = target - start;
      if (Math.abs(target - start) > 0.5) hasMovement = true;
    });

    if (!hasMovement) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    const startTime = performance.now();
    const intervalMs = 25; // 40 FPS สำหรับความสมูทในการส่ง Serial & Render

    // ฟังก์ชัน Ease-in-out Sine ให้การเร่งและชะลอตัวนุ่มนวลเป็นธรรมชาติ
    const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;

    this.smoothAnimTimer = setInterval(() => {
      const now = performance.now();
      const elapsed = now - startTime;
      let progress = elapsed / duration;

      if (progress >= 1) {
        progress = 1;
        clearInterval(this.smoothAnimTimer);
        this.smoothAnimTimer = null;
      }

      const easeVal = easeInOutSine(progress);

      cfg.axes.forEach(axis => {
        const val = startAngles[axis.key] + deltaAngles[axis.key] * easeVal;
        this.angles[axis.key] = Math.max(0, Math.min(180, Math.round(val)));
      });

      this.updateSlidersUI();
      this.updateTelemetryUI();
      if (this.visualizer3D) this.visualizer3D.setAngles(this.angles);
      if (this.visualizer) this.visualizer.setAngles(this.angles);
      this.sendAnglesImmediate();
      this.broadcastAngles();

      if (progress >= 1 && typeof onComplete === 'function') {
        onComplete();
      }
    }, intervalMs);
  }

  getPoseAngles(poseName) {
    if (poseName === 'home') {
      return { base: 90, shoulder: 90, elbow: 90, wristPitch: 90, wristRoll: 90, gripper: 90 };
    }
    if (poseName === 'straight') {
      // ท่าตรง: เหยียดตรงขึ้นฟ้าอย่างสง่า
      return { base: 90, shoulder: 90, elbow: 180, wristPitch: 90, wristRoll: 90, gripper: 90 };
    }
    if (poseName === 'ready') {
      // ท่าเตรียมพร้อม: โน้มตัวเฉียงลงข้างหน้าพร้อมหยิบ
      return { base: 90, shoulder: 65, elbow: 115, wristPitch: 75, wristRoll: 90, gripper: 45 };
    }
    if (poseName === 'rest') {
      // ท่าพักเก็บ: พับแขนแนบฐาน ปลอดภัย
      return { base: 90, shoulder: 25, elbow: 25, wristPitch: 30, wristRoll: 90, gripper: 20 };
    }
    return { base: 90, shoulder: 90, elbow: 90, wristPitch: 90, wristRoll: 90, gripper: 90 };
  }

  actionHome() {
    if (this.isDancing) this.stopDance();
    const target = this.getPoseAngles('home');
    this.moveToPoseSmooth(target, 700, () => {
      this.appendSerialLog({
        timestamp: new Date().toLocaleTimeString(),
        message: '🏠 เคลื่อนที่กลับสู่ Home Position (90°) อย่างนุ่มนวลสมูท',
        type: 'info'
      });
    });
  }

  actionPose(poseName) {
    if (this.isDancing) this.stopDance();
    const poseLabels = {
      straight: '📏 ท่าตรง (Straight Up)',
      ready: '⚡ ท่าเตรียมพร้อม (Ready Standby)',
      rest: '💤 ท่าพักเก็บ (Park / Rest)'
    };
    const target = this.getPoseAngles(poseName);
    this.moveToPoseSmooth(target, 750, () => {
      this.appendSerialLog({
        timestamp: new Date().toLocaleTimeString(),
        message: `🤖 เคลื่อนที่สู่ ${poseLabels[poseName] || poseName} เรียบร้อยแล้ว`,
        type: 'info'
      });
    });
  }

  toggleDance() {
    if (this.isDancing) {
      this.stopDance();
    } else {
      this.startDance();
    }
  }

  startDance() {
    this.isDancing = true;
    const danceBtn = document.getElementById('host-dance-btn-text');
    if (danceBtn) danceBtn.textContent = '⏹️ หยุดเต้น (Stop)';
    const danceBtnEl = document.getElementById('host-btn-dance');
    if (danceBtnEl) {
      danceBtnEl.classList.remove('from-purple-600/90', 'to-indigo-600/90');
      danceBtnEl.classList.add('from-amber-600', 'to-orange-600', 'animate-pulse');
    }

    this.appendSerialLog({
      timestamp: new Date().toLocaleTimeString(),
      message: '💃 เริ่มต้นท่าเต้นและโบกมือทักทาย (Dance & Wave Routine)!',
      type: 'info'
    });

    const danceSteps = [
      { angles: { base: 45, shoulder: 110, elbow: 140, wristPitch: 100, wristRoll: 130, gripper: 40 }, duration: 650 },
      { angles: { base: 45, shoulder: 110, elbow: 140, wristPitch: 70, wristRoll: 50, gripper: 150 }, duration: 400 },
      { angles: { base: 90, shoulder: 60, elbow: 90, wristPitch: 45, wristRoll: 90, gripper: 90 }, duration: 600 },
      { angles: { base: 135, shoulder: 110, elbow: 140, wristPitch: 100, wristRoll: 50, gripper: 40 }, duration: 650 },
      { angles: { base: 135, shoulder: 110, elbow: 140, wristPitch: 70, wristRoll: 130, gripper: 150 }, duration: 400 },
      { angles: { base: 90, shoulder: 100, elbow: 160, wristPitch: 90, wristRoll: 90, gripper: 90 }, duration: 550 },
      { angles: { base: 90, shoulder: 65, elbow: 115, wristPitch: 75, wristRoll: 90, gripper: 45 }, duration: 500 }
    ];

    let currentStep = 0;
    const runNextStep = () => {
      if (!this.isDancing) return;
      const step = danceSteps[currentStep];
      this.moveToPoseSmooth(step.angles, step.duration, () => {
        if (!this.isDancing) return;
        currentStep = (currentStep + 1) % danceSteps.length;
        this.danceTimer = setTimeout(runNextStep, 90);
      });
    };

    runNextStep();
  }

  stopDance() {
    this.isDancing = false;
    if (this.danceTimer) {
      clearTimeout(this.danceTimer);
      this.danceTimer = null;
    }
    if (this.smoothAnimTimer) {
      clearInterval(this.smoothAnimTimer);
      this.smoothAnimTimer = null;
    }

    const danceBtn = document.getElementById('host-dance-btn-text');
    if (danceBtn) danceBtn.textContent = '💃 ท่าเต้น (Dance)';
    const danceBtnEl = document.getElementById('host-btn-dance');
    if (danceBtnEl) {
      danceBtnEl.classList.remove('from-amber-600', 'to-orange-600', 'animate-pulse');
      danceBtnEl.classList.add('from-purple-600/90', 'to-indigo-600/90');
    }

    this.appendSerialLog({
      timestamp: new Date().toLocaleTimeString(),
      message: '⏹️ สิ้นสุดท่าเต้นแล้ว',
      type: 'info'
    });
  }

  actionToggleGrab() {
    const cfg = window.ArmConfig ? window.ArmConfig.getServoConfig(this.servoCount) : null;
    if (!cfg || !cfg.axes) return;

    const gripperAxis = cfg.axes.find(a => a.isGripper || a.key === 'gripper') || cfg.axes[cfg.axes.length - 1];
    if (!gripperAxis) return;

    const btnText = document.getElementById('host-grab-btn-text');
    const calib = window.ArmConfig ? window.ArmConfig.getGripperCalibration() : { release: 30, grab: 140 };

    if (this.isGripperClosed) {
      this.angles[gripperAxis.key] = calib.release; // ปล่อย
      this.isGripperClosed = false;
      if (btnText) btnText.textContent = 'Release (ปล่อย)';
    } else {
      this.angles[gripperAxis.key] = calib.grab; // คีบ
      this.isGripperClosed = true;
      if (btnText) btnText.textContent = 'Grab (จับ)';
    }

    this.handleSliderChange(gripperAxis.key, this.angles[gripperAxis.key]);
  }

  sendAnglesImmediate() {
    const cfg = window.ArmConfig ? window.ArmConfig.getServoConfig(this.servoCount) : null;
    if (!cfg || !cfg.axes) return;

    const angleList = cfg.axes.map(axis => Math.round(this.angles[axis.key] !== undefined ? this.angles[axis.key] : 90));
    if (this.serial && (this.serial.isConnected || this.serial.simulationMode)) {
      this.serial.sendAngles(angleList);
      this.txCount++;
      const txCounterEl = document.getElementById('host-tx-counter');
      if (txCounterEl) txCounterEl.textContent = this.txCount;
    }
  }

  sendAnglesThrottled(force = false) {
    const now = performance.now();
    if (!force && this.lastSerialSendTime && (now - this.lastSerialSendTime < 50)) {
      if (!this.serialThrottleTimer) {
        this.serialThrottleTimer = setTimeout(() => {
          this.serialThrottleTimer = null;
          this.sendAnglesImmediate();
        }, 50 - (now - this.lastSerialSendTime));
      }
      return;
    }
    this.lastSerialSendTime = now;
    if (this.serialThrottleTimer) {
      clearTimeout(this.serialThrottleTimer);
      this.serialThrottleTimer = null;
    }
    this.sendAnglesImmediate();
  }

  broadcastAngles() {
    const now = Date.now();
    if (now - this.lastBroadcastTime < 50) return;
    this.lastBroadcastTime = now;

    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'arm_command',
        payload: { ...this.angles }
      });
    }

    if (this.localBroadcastChannel) {
      try {
        this.localBroadcastChannel.postMessage({
          type: 'arm_command',
          payload: { ...this.angles }
        });
      } catch (e) { /* ignore */ }
    }
  }

  /**
   * สร้าง Telemetry Gauges ใน Host อัตโนมัติตามจำนวน Servo ที่เลือก
   */
  renderTelemetryGauges() {
    const container = document.getElementById('host-telemetry-container');
    if (!container) return;

    const cfg = window.ArmConfig ? window.ArmConfig.getServoConfig(this.servoCount) : null;
    if (!cfg || !cfg.axes) return;

    const colorMap = {
      blue: { bar: 'bg-blue-500', text: 'text-blue-400', valText: 'text-blue-300', dot: 'bg-blue-500', border: 'border-blue-500/20' },
      purple: { bar: 'bg-purple-500', text: 'text-purple-400', valText: 'text-purple-300', dot: 'bg-purple-500', border: 'border-purple-500/20' },
      cyan: { bar: 'bg-cyan-500', text: 'text-cyan-400', valText: 'text-cyan-300', dot: 'bg-cyan-500', border: 'border-cyan-500/20' },
      amber: { bar: 'bg-amber-500', text: 'text-amber-400', valText: 'text-amber-300', dot: 'bg-amber-500', border: 'border-amber-500/20' },
      rose: { bar: 'bg-rose-500', text: 'text-rose-400', valText: 'text-rose-300', dot: 'bg-rose-500', border: 'border-rose-500/20' },
      emerald: { bar: 'bg-emerald-500', text: 'text-emerald-400', valText: 'text-emerald-300', dot: 'bg-emerald-500', border: 'border-emerald-500/20' }
    };

    const telemetryLabels = {
      base: { min: '0° (Left)', mid: '90° (Center)', max: '180° (Right)' },
      shoulder: { min: '0° (Down)', mid: '90° (Upright)', max: '180° (Back)' },
      elbow: { min: '0° (Folded)', mid: '90° (Normal)', max: '180° (Extended)' },
      wristPitch: { min: '0° (Down)', mid: '90° (Mid)', max: '180° (Up)' },
      wristRoll: { min: '0° (CCW)', mid: '90° (Center)', max: '180° (CW)' },
      gripper: { min: '0° (Released)', mid: '90° (Mid)', max: '180° (Clamped)' }
    };

    const isCompact = this.servoCount >= 5;
    container.className = isCompact ? 'space-y-1.5' : 'space-y-2 sm:space-y-2.5';
    container.innerHTML = '';

    cfg.axes.forEach((axis, idx) => {
      const c = colorMap[axis.color] || colorMap.blue;
      const initialVal = this.angles[axis.key] !== undefined ? Math.round(this.angles[axis.key]) : 90;
      const pct = (initialVal / 180) * 100;
      const tLbls = telemetryLabels[axis.key] || { min: '0°', mid: '90°', max: '180°' };

      const card = document.createElement('div');
      card.className = isCompact
        ? `bg-slate-900/60 px-2.5 py-1.5 rounded-xl border ${c.border} space-y-0.5`
        : `bg-slate-900/60 px-3 py-2 rounded-xl border ${c.border} space-y-1`;

      card.innerHTML = `
        <div class="flex justify-between items-center">
          <span class="text-xs font-semibold ${c.text} flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full ${c.dot}"></span>
            Axis ${idx + 1}: ${axis.name} (${axis.nameTh})
          </span>
          <span id="host-val-${axis.key}" class="font-mono-tech text-xs font-bold ${c.valText}">${initialVal}°</span>
        </div>
        <div class="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div id="host-bar-${axis.key}" class="h-full ${c.bar} rounded-full transition-all duration-100" style="width: ${pct}%;"></div>
        </div>
        <div class="flex justify-between text-[9px] text-slate-500 font-mono-tech leading-none">
          <span>${tLbls.min}</span>
          <span>${tLbls.mid}</span>
          <span>${tLbls.max}</span>
        </div>
      `;
      container.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * อัปเดต Dropdown และปุ่มเลือกจำนวน Servo ในแถบควบคุม
   */
  updateServoSelectorUI() {
    // 1. Dropdown select
    const selectEl = document.getElementById('host-servo-select');
    if (selectEl && selectEl.value !== String(this.servoCount)) {
      selectEl.value = String(this.servoCount);
    }

    // 2. Segmented buttons (ถ้ามี)
    const buttons = document.querySelectorAll('.host-servo-btn');
    buttons.forEach(btn => {
      const count = parseInt(btn.getAttribute('data-servo-count'), 10);
      if (count === this.servoCount) {
        btn.className = 'host-servo-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md shadow-blue-500/30 border border-cyan-400/40';
      } else {
        btn.className = 'host-servo-btn px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-all border border-transparent';
      }
    });

    // 3. Badges
    const titleBadge = document.getElementById('host-servo-mode-badge');
    if (titleBadge) {
      titleBadge.textContent = `${this.servoCount} SERVOS`;
    }
    const jointsBadge = document.getElementById('host-joints-badge');
    if (jointsBadge) {
      jointsBadge.textContent = `${this.servoCount} SERVOS`;
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

    if (this.channel) {
      try {
        this.supabase.removeChannel(this.channel);
      } catch (e) { /* ignore */ }
    }

    const channelName = `robot-room-${this.roomCode}`;
    this.channel = this.supabase.channel(channelName, {
      config: {
        broadcast: { ack: false, self: true }
      }
    });

    // 1. รับค่าองศาจาก Mobile Controller
    this.channel.on('broadcast', { event: 'arm_command' }, (payload) => {
      if (payload && payload.payload) {
        this.handleIncomingCommand(payload.payload);
      }
    });

    // 2. รับคำสั่ง Emergency Stop
    this.channel.on('broadcast', { event: 'emergency_stop' }, () => {
      this.handleEmergencyStop(false);
    });

    // 3. Heartbeat / Client Connect Ping -> ตอบกลับด้วย Config ปัจจุบันของ Host
    this.channel.on('broadcast', { event: 'client_joined' }, (payload) => {
      this.connectedClientsCount = Math.max(1, this.connectedClientsCount + 1);
      const countEl = document.getElementById('host-clients-count');
      if (countEl) countEl.textContent = `${this.connectedClientsCount} อุปกรณ์`;
      this.appendSerialLog({
        timestamp: new Date().toLocaleTimeString(),
        message: `อุปกรณ์ (Mobile Controller) เข้าร่วมห้อง #${this.roomCode}`,
        type: 'info'
      });

      // ส่ง Config จำนวน Servo ไปให้อุปกรณ์ที่เพิ่งเข้ามา
      setTimeout(() => this.broadcastConfig(), 100);
    });

    // 4. รับการเปลี่ยนจำนวน Servo จาก Controller (ถ้าผู้ใช้เปลี่ยนฝั่งมือถือ)
    this.channel.on('broadcast', { event: 'config_change' }, (payload) => {
      if (payload && payload.payload && payload.payload.servoCount) {
        if (payload.payload.servoCount !== this.servoCount) {
          this.setServoCount(payload.payload.servoCount, false);
        }
      }
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
          message: `เปิดห้อง Realtime #${this.roomCode} สำเร็จ (${this.servoCount} Servos Mode)`,
          type: 'success'
        });
      } else {
        if (badge) {
          badge.className = 'px-3 py-1 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1.5';
          badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400"></span> ${status}`;
        }
      }
    });

    this.setupLocalFallbackBridge();
  }

  setupLocalFallbackBridge() {
    if (this._localBridgeHandler) {
      window.removeEventListener('robot_arm_direct_command', this._localBridgeHandler);
    }
    this._localBridgeHandler = (e) => {
      if (e.detail && String(e.detail.roomCode) === String(this.roomCode)) {
        this.handleIncomingCommand(e.detail.payload);
      }
    };
    window.addEventListener('robot_arm_direct_command', this._localBridgeHandler);

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

    if ('BroadcastChannel' in window) {
      try {
        if (this.localBroadcastChannel) this.localBroadcastChannel.close();
        this.localBroadcastChannel = new BroadcastChannel(`robot-room-bc-${this.roomCode}`);
        this.localBroadcastChannel.onmessage = (event) => {
          if (event.data && event.data.type === 'arm_command') {
            this.handleIncomingCommand(event.data.payload);
          } else if (event.data && event.data.type === 'emergency_stop') {
            this.handleEmergencyStop(false);
          } else if (event.data && event.data.type === 'config_change') {
            if (event.data.payload && event.data.payload.servoCount !== this.servoCount) {
              this.setServoCount(event.data.payload.servoCount, false);
            }
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
    const cfg = window.ArmConfig ? window.ArmConfig.getServoConfig(this.servoCount) : null;
    if (!cfg || !cfg.axes) return;

    // อัปเดตค่ามุมตามแกนที่มีอยู่
    const angleList = [];
    cfg.axes.forEach(axis => {
      if (data[axis.key] !== undefined) {
        this.angles[axis.key] = Math.max(0, Math.min(180, Number(data[axis.key])));
      }
      angleList.push(this.angles[axis.key] !== undefined ? this.angles[axis.key] : 90);
    });

    // อัปเดต Sliders บน PC Host View
    this.updateSlidersUI();

    // อัปเดตตัวเลข Telemetry บน UI
    this.updateTelemetryUI();

    // อัปเดตกราฟิก 3D Kinematics
    if (this.visualizer3D) {
      this.visualizer3D.setAngles(this.angles);
    }

    // อัปเดตกราฟิก 2D Kinematics บน Canvas
    if (this.visualizer) {
      this.visualizer.setAngles(this.angles);
    }

    // ส่งต่อไปยังบอร์ด ESP32 ผ่าน Web Serial API ในรูปแบบ "a1,a2,...,aN\n"
    if (this.serial) {
      this.serial.sendAngles(angleList);
      this.txCount++;
      const txCounterEl = document.getElementById('host-tx-counter');
      if (txCounterEl) txCounterEl.textContent = this.txCount;
    }
  }

  handleEmergencyStop(broadcast = true) {
    this.appendSerialLog({
      timestamp: new Date().toLocaleTimeString(),
      message: '🚨 EMERGENCY STOP TRIGGERED!',
      type: 'error'
    });

    if (broadcast) {
      if (this.channel) {
        this.channel.send({
          type: 'broadcast',
          event: 'emergency_stop',
          payload: {}
        });
      }
      if (this.localBroadcastChannel) {
        try {
          this.localBroadcastChannel.postMessage({ type: 'emergency_stop' });
        } catch (e) { /* ignore */ }
      }
    }

    // แสดง Modal Emergency Stop
    const modal = document.getElementById('ctrl-estop-modal');
    if (modal) modal.classList.remove('hidden');
  }

  updateTelemetryUI() {
    const cfg = window.ArmConfig ? window.ArmConfig.getServoConfig(this.servoCount) : null;
    if (!cfg || !cfg.axes) return;

    const angleValues = [];
    cfg.axes.forEach(axis => {
      const val = Math.round(this.angles[axis.key] !== undefined ? this.angles[axis.key] : 90);
      angleValues.push(val);

      const valEl = document.getElementById(`host-val-${axis.key}`);
      const barEl = document.getElementById(`host-bar-${axis.key}`);
      if (valEl) valEl.textContent = `${val}°`;
      if (barEl) {
        const pct = (val / 180) * 100;
        barEl.style.width = `${pct}%`;
      }
    });

    const plainStrEl = document.getElementById('host-serial-string-preview');
    if (plainStrEl) {
      plainStrEl.textContent = `${angleValues.join(',')}\\n`;
    }
  }

  updateSerialStatus(status, message) {
    const statusDot = document.getElementById('host-serial-dot');
    const statusText = document.getElementById('host-serial-status-text');
    const connectBtn = document.getElementById('host-btn-connect-serial');
    const disconnectBtn = document.getElementById('host-btn-disconnect-serial');

    if (status === 'connected') {
      if (statusDot) statusDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 status-glow-green';
      if (statusText) {
        statusText.textContent = 'Connected (ESP32 Ready)';
        statusText.className = 'text-xs font-bold text-emerald-400';
      }
      if (connectBtn) connectBtn.classList.add('hidden');
      if (disconnectBtn) disconnectBtn.classList.remove('hidden');
    } else if (status === 'connecting') {
      if (statusDot) statusDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse';
      if (statusText) {
        statusText.textContent = 'Connecting...';
        statusText.className = 'text-xs font-bold text-amber-400';
      }
    } else {
      if (statusDot) statusDot.className = 'w-2.5 h-2.5 rounded-full bg-rose-500 status-glow-red';
      if (statusText) {
        statusText.textContent = 'Disconnected';
        statusText.className = 'text-xs font-bold text-rose-400';
      }
      if (connectBtn) connectBtn.classList.remove('hidden');
      if (disconnectBtn) disconnectBtn.classList.add('hidden');
    }
  }

  appendSerialLog(entry) {
    const logBox = document.getElementById('host-serial-log-box');
    if (!logBox) return;

    // ลบข้อความเริ่มต้น italic ถ้ามี
    const initialPlaceholder = logBox.querySelector('.italic');
    if (initialPlaceholder) initialPlaceholder.remove();

    const row = document.createElement('div');
    row.className = 'text-[11px] font-mono-tech py-0.5 leading-relaxed flex items-start gap-1.5 border-b border-white/5';

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

    // อัปเดตรหัสใน Telemetry Footer
    const telemetryCodeEl = document.getElementById('host-telemetry-room-code');
    if (telemetryCodeEl) telemetryCodeEl.textContent = this.roomCode;

    // อัปเดตรหัสและรูปภาพใน Modal QR
    const qrImg = document.getElementById('modal-qr-img');
    const qrRoomCode = document.getElementById('modal-qr-room-code');
    if (qrRoomCode) qrRoomCode.textContent = this.roomCode;
    if (qrImg) {
      const roomUrl = `${window.location.origin}${window.location.pathname}#controller?room=${this.roomCode}`;
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(roomUrl)}`;
    }
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

    // ปุ่มคัดลอกลิงก์ใน Modal QR
    const modalQrCopyBtn = document.getElementById('modal-qr-copy-btn');
    if (modalQrCopyBtn) {
      modalQrCopyBtn.addEventListener('click', () => {
        const url = new URL(window.location.href);
        url.hash = `controller?room=${this.roomCode}`;
        navigator.clipboard.writeText(url.toString()).then(() => {
          const originalText = modalQrCopyBtn.innerHTML;
          modalQrCopyBtn.innerHTML = '✓ คัดลอกแล้ว!';
          setTimeout(() => modalQrCopyBtn.innerHTML = originalText, 2000);
        });
      });
    }

    // ปุ่มทดสอบส่ง Test Frame
    const testSendBtn = document.getElementById('host-btn-test-send');
    if (testSendBtn) {
      testSendBtn.addEventListener('click', () => {
        const cfg = window.ArmConfig ? window.ArmConfig.getServoConfig(this.servoCount) : null;
        const testAngles = (cfg ? cfg.axes : []).map(() => 90);
        this.serial.sendAngles(testAngles);
      });
    }

    // จัดการเลือก Dropdown จำนวน Servo (2, 3, 4, 5, 6)
    const servoSelect = document.getElementById('host-servo-select');
    if (servoSelect) {
      servoSelect.addEventListener('change', (e) => {
        const count = parseInt(e.target.value, 10);
        if ([2, 3, 4, 5, 6].includes(count)) {
          this.setServoCount(count, true);
        }
      });
    }

    // ผูกปุ่มเปลี่ยนจำนวน Servo (กรณีมีปุ่ม segmented)
    const servoButtons = document.querySelectorAll('.host-servo-btn');
    servoButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const count = parseInt(btn.getAttribute('data-servo-count'), 10);
        if ([2, 3, 4, 5, 6].includes(count)) {
          this.setServoCount(count, true);
        }
      });
    });

    // ปุ่ม Quick Actions & Poses ใน Host Sliders
    const homeBtn = document.getElementById('host-btn-home');
    if (homeBtn) {
      homeBtn.addEventListener('click', () => this.actionHome());
    }

    const straightBtn = document.getElementById('host-btn-straight');
    if (straightBtn) {
      straightBtn.addEventListener('click', () => this.actionPose('straight'));
    }

    const readyBtn = document.getElementById('host-btn-ready');
    if (readyBtn) {
      readyBtn.addEventListener('click', () => this.actionPose('ready'));
    }

    const restBtn = document.getElementById('host-btn-rest');
    if (restBtn) {
      restBtn.addEventListener('click', () => this.actionPose('rest'));
    }

    const danceBtn = document.getElementById('host-btn-dance');
    if (danceBtn) {
      danceBtn.addEventListener('click', () => this.toggleDance());
    }

    const grabBtn = document.getElementById('host-btn-toggle-grab');
    if (grabBtn) {
      grabBtn.addEventListener('click', () => this.actionToggleGrab());
    }

    // ปุ่ม Emergency Stop ใน Host Sliders
    const estopBtn = document.getElementById('host-btn-estop');
    if (estopBtn) {
      estopBtn.addEventListener('click', () => this.handleEmergencyStop(true));
    }

    // ปุ่ม Resume จาก Emergency Stop Modal
    const resumeBtn = document.getElementById('ctrl-btn-resume-estop');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        const modal = document.getElementById('ctrl-estop-modal');
        if (modal) modal.classList.add('hidden');
        this.actionHome();
      });
    }

    // ปุ่มสลับโหมด 3D / 2D
    const btn3D = document.getElementById('btn-sim-mode-3d');
    if (btn3D) {
      btn3D.addEventListener('click', () => this.switchSimMode('3d'));
    }
    const btn2D = document.getElementById('btn-sim-mode-2d');
    if (btn2D) {
      btn2D.addEventListener('click', () => this.switchSimMode('2d'));
    }

    // ปุ่มรีเซ็ตมุมกล้อง 3D
    const resetCamBtn = document.getElementById('host-btn-reset-cam-3d');
    if (resetCamBtn) {
      resetCamBtn.addEventListener('click', () => {
        if (this.visualizer3D) this.visualizer3D.resetCamera();
      });
    }
  }
}

window.HostController = HostController;
