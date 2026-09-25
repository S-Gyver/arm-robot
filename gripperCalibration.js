/**
 * Multi-Axis Robot Arm Calibration System
 * ระบบตั้งค่าขอบเขต Min / Max / Home และ Invert สำหรับทุกข้อต่อ (2-6 Servos)
 * รองรับ: Base, Shoulder, Elbow, WristPitch, WristRoll และ Gripper
 * บันทึกค่าแยกรายบุคคลใน localStorage ป้องกันเซอร์โวติดขัด (Stall) หรือฝืนเชิงกล
 */

(function () {
  const MODAL_ID = 'modal-robot-calibration';
  let activeTabKey = 'base';
  let tempCalibration = {};

  const AXIS_META = {
    base: { name: 'Base Rotation', nameTh: 'ฐานหมุน', icon: 'rotate-cw', color: 'blue', border: 'border-blue-500/30', bg: 'bg-blue-500/20', text: 'text-blue-400', minDesc: 'ซ้ายสุด', maxDesc: 'ขวาสุด' },
    shoulder: { name: 'Shoulder Axis', nameTh: 'หัวไหล่ (ก้ม-เงย)', icon: 'move-vertical', color: 'purple', border: 'border-purple-500/30', bg: 'bg-purple-500/20', text: 'text-purple-400', minDesc: 'ก้มต่ำสุด', maxDesc: 'เงยสูงสุด' },
    elbow: { name: 'Elbow Axis', nameTh: 'ข้อศอก (พับแขน)', icon: 'maximize-2', color: 'cyan', border: 'border-cyan-500/30', bg: 'bg-cyan-500/20', text: 'text-cyan-400', minDesc: 'พับเข้างอสุด', maxDesc: 'เหยียดออกตรงสุด' },
    wristPitch: { name: 'Wrist Pitch', nameTh: 'ข้อมือ (ก้ม-เงย)', icon: 'activity', color: 'amber', border: 'border-amber-500/30', bg: 'bg-amber-500/20', text: 'text-amber-400', minDesc: 'ก้มลึกสุด', maxDesc: 'เงยสูงสุด' },
    wristRoll: { name: 'Wrist Roll', nameTh: 'ข้อมือ (หมุนบิด)', icon: 'refresh-cw', color: 'rose', border: 'border-rose-500/30', bg: 'bg-rose-500/20', text: 'text-rose-400', minDesc: 'บิดซ้ายสุด', maxDesc: 'บิดขวาสุด' },
    gripper: { name: 'Gripper', nameTh: 'มือก้ามปู (อ้า-คีบ)', icon: 'scissors', color: 'emerald', border: 'border-emerald-500/30', bg: 'bg-emerald-500/20', text: 'text-emerald-400', minDesc: 'อ้าสุด (Release)', maxDesc: 'คีบแน่นสุด (Grab)' }
  };

  // ตรวจสอบและสร้าง Modal HTML อัตโนมัติหากยังไม่มีใน DOM
  function ensureModalExists() {
    if (document.getElementById(MODAL_ID)) return;

    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 hidden select-none overflow-y-auto';
    modal.innerHTML = `
      <div class="max-w-2xl w-full glass-panel rounded-2xl p-4 sm:p-6 border border-cyan-500/30 shadow-2xl shadow-cyan-500/10 space-y-4 my-auto">
        
        <!-- Header -->
        <div class="flex items-center justify-between pb-3 border-b border-white/10">
          <div class="flex items-center gap-2.5">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <i data-lucide="sliders" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 class="font-bold text-base sm:text-lg text-white flex items-center gap-2">
                <span>ตั้งค่าและปรับเทียบเซอร์โว (Servo Calibration)</span>
              </h3>
              <p class="text-[11px] text-slate-400">ปรับแต่ง Min / Max / Home และ Invert ให้พอดีกับหุ่นยนต์ของแต่ละคน</p>
            </div>
          </div>
          <button onclick="closeCalibrationModal()" class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Axis Tabs Strip -->
        <div class="overflow-x-auto pb-1">
          <div id="calib-tabs-container" class="flex items-center gap-1.5 min-w-max p-1 bg-slate-900/90 rounded-xl border border-white/10 text-xs">
            <!-- Populated dynamically based on active servo count -->
          </div>
        </div>

        <!-- Active Axis Body Panel -->
        <div id="calib-active-panel" class="space-y-3.5 text-xs">
          <!-- Populated by renderActiveAxisPanel() -->
        </div>

        <!-- Footer Buttons -->
        <div class="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div class="flex items-center gap-1.5">
            <button type="button" onclick="resetActiveAxisCalibration()" class="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 flex items-center gap-1 transition">
              <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i> คืนค่าแกนนี้
            </button>
            <button type="button" onclick="resetAllAxesCalibrationUI()" class="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-rose-900/40 hover:text-rose-300 text-slate-400 flex items-center gap-1 transition text-[11px]" title="คืนค่าเริ่มต้นของทุกข้อต่อ">
              <i data-lucide="refresh-cw" class="w-3 h-3"></i> รีเซ็ตทั้งหมด
            </button>
          </div>
          
          <div class="flex items-center gap-2">
            <button type="button" onclick="closeCalibrationModal()" class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition">
              ยกเลิก
            </button>
            <button type="button" onclick="saveAllCalibration()" class="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold shadow-lg shadow-cyan-500/25 flex items-center gap-1.5 active:scale-95 transition">
              <i data-lucide="check" class="w-4 h-4"></i> บันทึกการตั้งค่า
            </button>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(modal);
    if (window.lucide) window.lucide.createIcons();
  }

  // ดึงจำนวน Servo ปัจจุบัน
  function getActiveServoCount() {
    if (window.hostApp && window.hostApp.servoCount) return window.hostApp.servoCount;
    if (window.ctrlApp && window.ctrlApp.servoCount) return window.ctrlApp.servoCount;
    if (window.ArmConfig) return window.ArmConfig.getCurrentServoCount();
    return 4;
  }

  // ส่งมุมชั่วคราวไปที่หุ่นยนต์
  let liveThrottleTimeout = null;
  function sendLiveAxisAngle(axisKey, angle) {
    if (liveThrottleTimeout) return;
    liveThrottleTimeout = setTimeout(() => {
      liveThrottleTimeout = null;
      executeAxisAngle(axisKey, angle);
    }, 40);
  }

  function executeAxisAngle(axisKey, angle) {
    const val = Math.max(0, Math.min(180, Number(angle)));

    // 1. ถ้ามี HostController
    if (window.hostApp && typeof window.hostApp.handleSliderChange === 'function') {
      window.hostApp.handleSliderChange(axisKey, val, false);
      return;
    }

    // 2. ถ้ามี MobileArmController
    if (window.ctrlApp && typeof window.ctrlApp.sendAnglesImmediate === 'function') {
      window.ctrlApp.angles[axisKey] = val;
      window.ctrlApp.updateSlidersUI();
      window.ctrlApp.sendAnglesImmediate();
      return;
    }
  }

  // สร้างแท็บของแกนตามโหมดเซอร์โว
  function renderTabs() {
    const container = document.getElementById('calib-tabs-container');
    if (!container) return;

    const servoCount = getActiveServoCount();
    const cfg = window.ArmConfig ? window.ArmConfig.getServoConfig(servoCount) : null;
    const axes = cfg && cfg.axes ? cfg.axes : [
      { key: 'base', name: 'Base', nameTh: 'ฐาน' },
      { key: 'shoulder', name: 'Shoulder', nameTh: 'ไหล่' },
      { key: 'elbow', name: 'Elbow', nameTh: 'ศอก' },
      { key: 'gripper', name: 'Gripper', nameTh: 'ก้ามปู' }
    ];

    // ตรวจสอบว่าแท็บปัจจุบันอยู่ในรายการแกนหรือไม่
    if (!axes.find(a => a.key === activeTabKey)) {
      activeTabKey = axes[0].key;
    }

    container.innerHTML = '';
    axes.forEach(axis => {
      const meta = AXIS_META[axis.key] || { icon: 'sliders', nameTh: axis.name, color: 'blue' };
      const isActive = axis.key === activeTabKey;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = isActive
        ? 'px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all text-white bg-gradient-to-r from-cyan-500 to-blue-600 shadow-md shadow-cyan-500/25'
        : 'px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all text-slate-400 hover:text-slate-200 hover:bg-slate-800';
      btn.innerHTML = `
        <i data-lucide="${meta.icon}" class="w-3.5 h-3.5"></i>
        <span>${axis.name || meta.name}</span>
      `;
      btn.onclick = () => {
        activeTabKey = axis.key;
        renderTabs();
        renderActiveAxisPanel();
      };
      container.appendChild(btn);
    });

    if (window.lucide) window.lucide.createIcons();
  }

  // แสดงผลเนื้อหาของแกนที่เลือก
  function renderActiveAxisPanel() {
    const panel = document.getElementById('calib-active-panel');
    if (!panel) return;

    const axis = AXIS_META[activeTabKey] || AXIS_META.base;
    const data = tempCalibration[activeTabKey] || { min: 0, max: 180, home: 90, inverted: false };
    const isGripper = activeTabKey === 'gripper';

    panel.innerHTML = `
      <!-- Notice Box for Active Axis -->
      <div class="p-3 rounded-xl bg-slate-900/80 border ${axis.border} flex items-start gap-2.5">
        <div class="w-8 h-8 rounded-lg ${axis.bg} ${axis.text} flex items-center justify-center flex-shrink-0 mt-0.5">
          <i data-lucide="${axis.icon}" class="w-4 h-4"></i>
        </div>
        <div class="flex-1">
          <div class="font-bold text-slate-100 flex items-center gap-2">
            <span>${axis.name}</span>
            <span class="text-[11px] text-slate-400">(${axis.nameTh})</span>
          </div>
          <p class="text-[11px] text-slate-400 mt-0.5">
            ${isGripper 
              ? 'ปรับระยะอ้าสุดและคีบสุดให้พอดีกับมือก้ามปูของนักเรียน ไม่ฝืนโครงสร้าง' 
              : `กำหนดองศาการเคลื่อนไหวที่ปลอดภัยของข้อต่อนี้ ป้องกันแขนกลติดขัดหรือชนขอบโต๊ะ`}
          </p>
        </div>
      </div>

      <!-- Controls Grid: Min & Max Limits -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        
        <!-- 1. Min Limit -->
        <div class="bg-slate-900/80 p-3 rounded-xl border border-white/10 space-y-2">
          <div class="flex items-center justify-between">
            <label class="font-bold text-slate-200 flex items-center gap-1.5">
              <span class="text-cyan-400">◀</span>
              <span>${isGripper ? 'ระยะอ้าสุด (Release Min)' : `ขอบเขตน้อยสุด (Min Limit)`}</span>
            </label>
            <div class="flex items-center gap-1">
              <button type="button" onclick="adjustAxisVal('${activeTabKey}', 'min', -1)" class="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold">-</button>
              <span id="calib-val-min" class="w-12 text-center font-mono-tech font-bold text-cyan-400 text-sm bg-slate-950/80 px-1 py-0.5 rounded border border-white/10">${data.min}°</span>
              <button type="button" onclick="adjustAxisVal('${activeTabKey}', 'min', 1)" class="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold">+</button>
            </div>
          </div>
          <input id="calib-slider-min" type="range" min="0" max="180" value="${data.min}" class="touch-slider slider-cyan w-full">
          <div class="flex justify-between items-center text-[10px] text-slate-400 font-mono-tech">
            <span>0° (${axis.minDesc})</span>
            <button type="button" onclick="testCalibAngle('${activeTabKey}', ${data.min})" class="px-2 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 font-sans font-semibold flex items-center gap-1 active:scale-95 transition">
              <i data-lucide="play" class="w-3 h-3"></i> ทดสอบ Min
            </button>
            <span>180°</span>
          </div>
        </div>

        <!-- 2. Max Limit -->
        <div class="bg-slate-900/80 p-3 rounded-xl border border-white/10 space-y-2">
          <div class="flex items-center justify-between">
            <label class="font-bold text-slate-200 flex items-center gap-1.5">
              <span class="text-emerald-400">▶</span>
              <span>${isGripper ? 'ระยะคีบสุด (Grab Max)' : `ขอบเขตมากสุด (Max Limit)`}</span>
            </label>
            <div class="flex items-center gap-1">
              <button type="button" onclick="adjustAxisVal('${activeTabKey}', 'max', -1)" class="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold">-</button>
              <span id="calib-val-max" class="w-12 text-center font-mono-tech font-bold text-emerald-400 text-sm bg-slate-950/80 px-1 py-0.5 rounded border border-white/10">${data.max}°</span>
              <button type="button" onclick="adjustAxisVal('${activeTabKey}', 'max', 1)" class="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold">+</button>
            </div>
          </div>
          <input id="calib-slider-max" type="range" min="0" max="180" value="${data.max}" class="touch-slider slider-emerald w-full">
          <div class="flex justify-between items-center text-[10px] text-slate-400 font-mono-tech">
            <span>0°</span>
            <button type="button" onclick="testCalibAngle('${activeTabKey}', ${data.max})" class="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-sans font-semibold flex items-center gap-1 active:scale-95 transition">
              <i data-lucide="play" class="w-3 h-3"></i> ทดสอบ Max
            </button>
            <span>180° (${axis.maxDesc})</span>
          </div>
        </div>

      </div>

      <!-- Home Position & Invert Strip -->
      <div class="bg-slate-900/80 p-3 rounded-xl border border-white/10 space-y-2">
        <div class="flex items-center justify-between">
          <label class="font-bold text-slate-200 flex items-center gap-1.5">
            <i data-lucide="home" class="w-3.5 h-3.5 text-amber-400"></i>
            <span>ตำแหน่งกึ่งกลาง / ท่าเริ่มต้น (Home Position)</span>
          </label>
          <div class="flex items-center gap-1">
            <button type="button" onclick="adjustAxisVal('${activeTabKey}', 'home', -1)" class="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold">-</button>
            <span id="calib-val-home" class="w-12 text-center font-mono-tech font-bold text-amber-400 text-sm bg-slate-950/80 px-1 py-0.5 rounded border border-white/10">${data.home}°</span>
            <button type="button" onclick="adjustAxisVal('${activeTabKey}', 'home', 1)" class="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold">+</button>
          </div>
        </div>
        <input id="calib-slider-home" type="range" min="${data.min}" max="${data.max}" value="${data.home}" class="touch-slider slider-amber w-full">
        <div class="flex justify-between items-center text-[10px] text-slate-400 font-mono-tech">
          <span>Min: ${data.min}°</span>
          <button type="button" onclick="testCalibAngle('${activeTabKey}', ${data.home})" class="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-sans font-semibold flex items-center gap-1 active:scale-95 transition">
            <i data-lucide="play" class="w-3 h-3"></i> ทดสอบท่า Home
          </button>
          <span>Max: ${data.max}°</span>
        </div>
      </div>

      <!-- Invert Switch & Live Test -->
      <div class="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/60 border border-white/5">
        <div class="flex items-center gap-2">
          <i data-lucide="repeat" class="w-4 h-4 text-purple-400"></i>
          <div>
            <span class="font-semibold text-slate-200">สลับทิศทางหมุน (Invert Direction)</span>
            <p class="text-[10px] text-slate-400">เปิดใช้เมื่อประกอบเซอร์โวสลับด้าน</p>
          </div>
        </div>
        <label class="relative inline-flex items-center cursor-pointer">
          <input id="calib-invert-toggle" type="checkbox" ${data.inverted ? 'checked' : ''} class="sr-only peer">
          <div class="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
        </label>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    // Bind inputs
    const sliderMin = document.getElementById('calib-slider-min');
    const sliderMax = document.getElementById('calib-slider-max');
    const sliderHome = document.getElementById('calib-slider-home');
    const invertToggle = document.getElementById('calib-invert-toggle');

    if (sliderMin) {
      sliderMin.addEventListener('input', (e) => {
        let val = Number(e.target.value);
        if (val > data.max) val = data.max;
        data.min = val;
        if (activeTabKey === 'gripper') data.release = val;
        sliderMin.value = val;
        document.getElementById('calib-val-min').textContent = `${val}°`;
        if (sliderHome) sliderHome.min = val;
        sendLiveAxisAngle(activeTabKey, val);
      });
    }

    if (sliderMax) {
      sliderMax.addEventListener('input', (e) => {
        let val = Number(e.target.value);
        if (val < data.min) val = data.min;
        data.max = val;
        if (activeTabKey === 'gripper') data.grab = val;
        sliderMax.value = val;
        document.getElementById('calib-val-max').textContent = `${val}°`;
        if (sliderHome) sliderHome.max = val;
        sendLiveAxisAngle(activeTabKey, val);
      });
    }

    if (sliderHome) {
      sliderHome.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        data.home = val;
        document.getElementById('calib-val-home').textContent = `${val}°`;
        sendLiveAxisAngle(activeTabKey, val);
      });
    }

    if (invertToggle) {
      invertToggle.addEventListener('change', (e) => {
        data.inverted = e.target.checked;
      });
    }
  }

  // ปรับค่าปุ่ม + / -
  window.adjustAxisVal = function (axisKey, prop, delta) {
    const data = tempCalibration[axisKey];
    if (!data) return;
    let next = (data[prop] || 0) + delta;
    next = Math.max(0, Math.min(180, next));

    if (prop === 'min' && next > data.max) next = data.max;
    if (prop === 'max' && next < data.min) next = data.min;
    if (prop === 'home') next = Math.max(data.min, Math.min(data.max, next));

    data[prop] = next;
    if (axisKey === 'gripper') {
      if (prop === 'min') data.release = next;
      if (prop === 'max') data.grab = next;
    }
    renderActiveAxisPanel();
    sendLiveAxisAngle(axisKey, next);
  };

  // ทดสอบมุม
  window.testCalibAngle = function (axisKey, angle) {
    executeAxisAngle(axisKey, angle);
  };

  // เปิด Modal ปรับเทียบ (ระบุแกนเริ่มต้นได้)
  window.openCalibrationModal = function (preferredAxisKey = null) {
    ensureModalExists();
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;

    // โหลดค่า Calibrate ปัจจุบันเข้ามาใน Temp
    if (window.ArmConfig && typeof window.ArmConfig.getAllCalibration === 'function') {
      tempCalibration = JSON.parse(JSON.stringify(window.ArmConfig.getAllCalibration()));
    } else {
      tempCalibration = {
        base: { min: 0, max: 180, home: 90, inverted: false },
        shoulder: { min: 0, max: 180, home: 90, inverted: false },
        elbow: { min: 0, max: 180, home: 90, inverted: false },
        wristPitch: { min: 0, max: 180, home: 90, inverted: false },
        wristRoll: { min: 0, max: 180, home: 90, inverted: false },
        gripper: { min: 30, max: 140, home: 90, release: 30, grab: 140, inverted: false }
      };
    }

    if (preferredAxisKey && AXIS_META[preferredAxisKey]) {
      activeTabKey = preferredAxisKey;
    }

    renderTabs();
    renderActiveAxisPanel();
    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  };

  // Alias สำหรับ backward-compatibility กับ Gripper
  window.openGripperCalibrationModal = function () {
    window.openCalibrationModal('gripper');
  };

  // ปิด Modal
  window.closeCalibrationModal = function () {
    const modal = document.getElementById(MODAL_ID);
    if (modal) modal.classList.add('hidden');
  };

  window.closeGripperCalibrationModal = window.closeCalibrationModal;

  // คืนค่าเริ่มต้นเฉพาะแกนที่เลือก
  window.resetActiveAxisCalibration = function () {
    const def = window.ArmConfig && window.ArmConfig.DEFAULT_AXIS_CALIBRATION
      ? window.ArmConfig.DEFAULT_AXIS_CALIBRATION[activeTabKey]
      : { min: 0, max: 180, home: 90, inverted: false };

    tempCalibration[activeTabKey] = JSON.parse(JSON.stringify(def));
    renderActiveAxisPanel();
    showToastNotification(`🔄 คืนค่าเริ่มต้นของแกน ${AXIS_META[activeTabKey].nameTh} แล้ว`);
  };

  // คืนค่าเริ่มต้นของทุกแกน
  window.resetAllAxesCalibrationUI = function () {
    if (confirm('คุณต้องการรีเซ็ตค่า Calibrate ของทุกแกนกลับเป็นค่ามาตรฐานหรือไม่?')) {
      if (window.ArmConfig && typeof window.ArmConfig.resetAllCalibration === 'function') {
        tempCalibration = window.ArmConfig.resetAllCalibration();
      }
      renderActiveAxisPanel();
      showToastNotification('♻️ คืนค่าเริ่มต้นของทุกแกนเรียบร้อยแล้ว');
    }
  };

  // บันทึกการตั้งค่าทั้งหมด
  window.saveAllCalibration = function () {
    if (tempCalibration.gripper) {
      tempCalibration.gripper.release = tempCalibration.gripper.min;
      tempCalibration.gripper.grab = tempCalibration.gripper.max;
    }

    if (window.ArmConfig && typeof window.ArmConfig.setAllCalibration === 'function') {
      window.ArmConfig.setAllCalibration(tempCalibration);
    }

    if (window.ArmConfig && typeof window.ArmConfig.setGripperCalibration === 'function' && tempCalibration.gripper) {
      window.ArmConfig.setGripperCalibration(
        tempCalibration.gripper.min,
        tempCalibration.gripper.max,
        tempCalibration.gripper.inverted
      );
    }

    closeCalibrationModal();
    showToastNotification('✅ บันทึกการตั้งค่า Calibrate ทุกแกนเรียบร้อยแล้ว!');
  };

  // Toast Notification
  function showToastNotification(msg) {
    let toast = document.getElementById('robot-toast-notify');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'robot-toast-notify';
      toast.className = 'fixed bottom-5 right-5 z-50 bg-slate-900/95 text-cyan-400 border border-cyan-500/40 px-4 py-2.5 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2 transition-all duration-300 transform translate-y-10 opacity-0';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.remove('translate-y-10', 'opacity-0');
    setTimeout(() => {
      toast.classList.add('translate-y-10', 'opacity-0');
    }, 2800);
  }

  // เตรียม Modal
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureModalExists);
  } else {
    ensureModalExists();
  }
})();
