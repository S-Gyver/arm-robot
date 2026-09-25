/**
 * Global Configuration for Multi-Axis Robot Arm Web App
 * Supports 2, 3, 4, 5, and 6 Servo configurations
 * Real-time broker: Supabase Realtime (Broadcast channels)
 */

const DEFAULT_SUPABASE_URL = 'https://igiihteeeprpcxxlldkd.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnaWlodGVlZXBycGN4eGxsZGtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5ODkwNzksImV4cCI6MjEwMDU2NTA3OX0.fr8_ZAYKQ3D-JgEtAWGJnNvKjoUmYxs1T7tjzzsEltw';

// โหลดการตั้งค่าจาก localStorage หากมีการระบุโดยผู้ใช้
const SUPABASE_URL = localStorage.getItem('arm_supabase_url') || DEFAULT_SUPABASE_URL;
const SUPABASE_KEY = localStorage.getItem('arm_supabase_key') || DEFAULT_SUPABASE_KEY;

// สร้าง Supabase Client แยกกันสำหรับแต่ละ Role (Host / Controller) ป้องกัน Channel ชนกัน
function createSupabaseClient() {
  if (window.supabase) {
    try {
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        realtime: {
          params: {
            eventsPerSecond: 30
          }
        }
      });
      return client;
    } catch (err) {
      console.error('❌ Failed to initialize Supabase client:', err);
    }
  }
  return null;
}

function getSupabaseClient() {
  return createSupabaseClient();
}

/**
 * นิยามการตั้งค่าเซอร์โวสำหรับ 2, 3, 4, 5 และ 6 Servos
 */
const SERVO_CONFIGS = {
  2: {
    count: 2,
    name: '2 Servos (2-Axis)',
    title: '2-Axis Robot Arm',
    subtitle: 'ฐานหมุน + ก้ามปู (Base & Gripper)',
    axes: [
      { key: 'base', name: 'Base Rotation', nameTh: 'ฐานหมุน', min: 0, max: 180, default: 90, color: 'blue', pin: 16, icon: 'rotate-cw', minLabel: '0° ซ้าย', maxLabel: '180° ขวา' },
      { key: 'gripper', name: 'Gripper', nameTh: 'มือจับ/ก้ามปู', min: 0, max: 180, default: 90, color: 'emerald', pin: 17, icon: 'scissors', isGripper: true, minLabel: '0° ปล่อย', maxLabel: '180° คีบ' }
    ]
  },
  3: {
    count: 3,
    name: '3 Servos (3-Axis)',
    title: '3-Axis Robot Arm',
    subtitle: 'ฐาน + แขนหลัก + ก้ามปู (Base, Arm, Gripper)',
    axes: [
      { key: 'base', name: 'Base Rotation', nameTh: 'ฐานหมุน', min: 0, max: 180, default: 90, color: 'blue', pin: 16, icon: 'rotate-cw', minLabel: '0° ซ้าย', maxLabel: '180° ขวา' },
      { key: 'shoulder', name: 'Main Arm', nameTh: 'แขนหลัก (ก้ม-เงย)', min: 0, max: 180, default: 90, color: 'purple', pin: 17, icon: 'move-vertical', minLabel: '0° ลง', maxLabel: '180° ขึ้น' },
      { key: 'gripper', name: 'Gripper', nameTh: 'มือจับ/ก้ามปู', min: 0, max: 180, default: 90, color: 'emerald', pin: 18, icon: 'scissors', isGripper: true, minLabel: '0° ปล่อย', maxLabel: '180° คีบ' }
    ]
  },
  4: {
    count: 4,
    name: '4 Servos (4-Axis)',
    title: '4-Axis Robot Arm (Standard)',
    subtitle: 'ฐาน + หัวไหล่ + ข้อศอก + ก้ามปู (Base, Shoulder, Elbow, Gripper)',
    axes: [
      { key: 'base', name: 'Base Rotation', nameTh: 'ฐานหมุน', min: 0, max: 180, default: 90, color: 'blue', pin: 16, icon: 'rotate-cw', minLabel: '0° ซ้าย', maxLabel: '180° ขวา' },
      { key: 'shoulder', name: 'Shoulder Axis', nameTh: 'หัวไหล่ (ก้ม-เงย)', min: 0, max: 180, default: 90, color: 'purple', pin: 17, icon: 'move-vertical', minLabel: '0° หน้า', maxLabel: '180° หลัง' },
      { key: 'elbow', name: 'Elbow Axis', nameTh: 'ข้อศอก (พับแขน)', min: 0, max: 180, default: 90, color: 'cyan', pin: 18, icon: 'maximize-2', minLabel: '0° พับเข้า', maxLabel: '180° ยืดออก' },
      { key: 'gripper', name: 'Gripper', nameTh: 'มือจับ/ก้ามปู', min: 0, max: 180, default: 90, color: 'emerald', pin: 19, icon: 'scissors', isGripper: true, minLabel: '0° ปล่อย', maxLabel: '180° คีบ' }
    ]
  },
  5: {
    count: 5,
    name: '5 Servos (5-Axis)',
    title: '5-Axis Robot Arm',
    subtitle: 'ฐาน + ไหล่ + ศอก + ข้อมือก้มเงย + ก้ามปู (+Wrist Pitch)',
    axes: [
      { key: 'base', name: 'Base Rotation', nameTh: 'ฐานหมุน', min: 0, max: 180, default: 90, color: 'blue', pin: 16, icon: 'rotate-cw', minLabel: '0° ซ้าย', maxLabel: '180° ขวา' },
      { key: 'shoulder', name: 'Shoulder Axis', nameTh: 'หัวไหล่', min: 0, max: 180, default: 90, color: 'purple', pin: 17, icon: 'move-vertical', minLabel: '0° หน้า', maxLabel: '180° หลัง' },
      { key: 'elbow', name: 'Elbow Axis', nameTh: 'ข้อศอก', min: 0, max: 180, default: 90, color: 'cyan', pin: 18, icon: 'maximize-2', minLabel: '0° พับเข้า', maxLabel: '180° ยืดออก' },
      { key: 'wristPitch', name: 'Wrist Pitch', nameTh: 'ข้อมือ (ก้ม-เงย)', min: 0, max: 180, default: 90, color: 'amber', pin: 19, icon: 'activity', minLabel: '0° ก้ม', maxLabel: '180° เงย' },
      { key: 'gripper', name: 'Gripper', nameTh: 'มือจับ/ก้ามปู', min: 0, max: 180, default: 90, color: 'emerald', pin: 21, icon: 'scissors', isGripper: true, minLabel: '0° ปล่อย', maxLabel: '180° คีบ' }
    ]
  },
  6: {
    count: 6,
    name: '6 Servos (6-Axis)',
    title: '6-Axis Robot Arm (Full DOF)',
    subtitle: 'ฐาน + ไหล่ + ศอก + ข้อมือก้มเงย + ข้อมือหมุน + ก้ามปู (+Wrist Roll)',
    axes: [
      { key: 'base', name: 'Base Rotation', nameTh: 'ฐานหมุน', min: 0, max: 180, default: 90, color: 'blue', pin: 16, icon: 'rotate-cw', minLabel: '0° ซ้าย', maxLabel: '180° ขวา' },
      { key: 'shoulder', name: 'Shoulder Axis', nameTh: 'หัวไหล่', min: 0, max: 180, default: 90, color: 'purple', pin: 17, icon: 'move-vertical', minLabel: '0° หน้า', maxLabel: '180° หลัง' },
      { key: 'elbow', name: 'Elbow Axis', nameTh: 'ข้อศอก', min: 0, max: 180, default: 90, color: 'cyan', pin: 18, icon: 'maximize-2', minLabel: '0° พับเข้า', maxLabel: '180° ยืดออก' },
      { key: 'wristPitch', name: 'Wrist Pitch', nameTh: 'ข้อมือ (ก้ม-เงย)', min: 0, max: 180, default: 90, color: 'amber', pin: 19, icon: 'activity', minLabel: '0° ก้ม', maxLabel: '180° เงย' },
      { key: 'wristRoll', name: 'Wrist Roll', nameTh: 'ข้อมือ (หมุนบิด)', min: 0, max: 180, default: 90, color: 'rose', pin: 21, icon: 'refresh-cw', minLabel: '0° ซ้าย', maxLabel: '180° ขวา' },
      { key: 'gripper', name: 'Gripper', nameTh: 'มือจับ/ก้ามปู', min: 0, max: 180, default: 90, color: 'emerald', pin: 22, icon: 'scissors', isGripper: true, minLabel: '0° ปล่อย', maxLabel: '180° คีบ' }
    ]
  }
};

/**
 * ดึงจำนวนเซอร์โวปัจจุบันที่บันทึกไว้ (ค่าเริ่มต้น 4 Servos)
 */
function getCurrentServoCount() {
  const saved = parseInt(localStorage.getItem('arm_servo_count'), 10);
  if ([2, 3, 4, 5, 6].includes(saved)) {
    return saved;
  }
  return 4; // ค่าเริ่มต้น
}

/**
 * บันทึกจำนวนเซอร์โว
 */
function setCurrentServoCount(count) {
  const n = parseInt(count, 10);
  if ([2, 3, 4, 5, 6].includes(n)) {
    localStorage.setItem('arm_servo_count', n);
    return n;
  }
  return 4;
}

/**
 * ดึง Config เซอร์โวตามจำนวน
 */
function getServoConfig(count = null) {
  const n = count || getCurrentServoCount();
  return SERVO_CONFIGS[n] || SERVO_CONFIGS[4];
}

/**
 * สร้างค่ามุม Home เริ่มต้นสำหรับจำนวนเซอร์โวนั้นๆ (อิงตามค่า Calibrate Home หากมีการตั้งค่าไว้)
 */
function getDefaultAngles(count = null) {
  const cfg = getServoConfig(count);
  const calib = typeof getAllCalibration === 'function' ? getAllCalibration() : {};
  const angles = {};
  cfg.axes.forEach(axis => {
    const c = calib[axis.key];
    angles[axis.key] = c && typeof c.home === 'number' ? c.home : (axis.default !== undefined ? axis.default : 90);
  });
  return angles;
}

/**
 * ดึงการตั้งค่า Calibrate ค่าเริ่มต้นสำหรับทุกแกน
 */
const DEFAULT_AXIS_CALIBRATION = {
  base: { min: 0, max: 180, home: 90, inverted: false },
  shoulder: { min: 0, max: 180, home: 90, inverted: false },
  elbow: { min: 0, max: 180, home: 90, inverted: false },
  wristPitch: { min: 0, max: 180, home: 90, inverted: false },
  wristRoll: { min: 0, max: 180, home: 90, inverted: false },
  gripper: { min: 30, max: 140, home: 90, release: 30, grab: 140, inverted: false }
};

/**
 * ดึงค่ามุม Calibrate ของ Gripper เฉพาะบุคคล (บันทึกใน localStorage)
 * release: ค่ามุมตอนปล่อย (อ้าสุด) - ค่าเริ่มต้น 30°
 * grab: ค่ามุมตอนคีบ (จับแน่น) - ค่าเริ่มต้น 140°
 * inverted: สลับทิศทาง (true หากค่า release > grab หรือประกอบกลับด้าน)
 */
function getGripperCalibration() {
  const savedRelease = localStorage.getItem('arm_gripper_release');
  const savedGrab = localStorage.getItem('arm_gripper_grab');
  const savedInverted = localStorage.getItem('arm_gripper_inverted');

  let release = savedRelease !== null ? parseInt(savedRelease, 10) : 30;
  let grab = savedGrab !== null ? parseInt(savedGrab, 10) : 140;
  let inverted = savedInverted === 'true';

  if (isNaN(release) || release < 0 || release > 180) release = 30;
  if (isNaN(grab) || grab < 0 || grab > 180) grab = 140;

  return { release, grab, inverted };
}

/**
 * ดึงการ Calibrate ของทุกแกนหุ่นยนต์
 */
function getAllCalibration() {
  const savedStr = localStorage.getItem('arm_all_calibration');
  let data = {};
  if (savedStr) {
    try { data = JSON.parse(savedStr); } catch (e) { data = {}; }
  }

  const gripCalib = getGripperCalibration();
  const result = {};

  Object.keys(DEFAULT_AXIS_CALIBRATION).forEach(key => {
    const def = DEFAULT_AXIS_CALIBRATION[key];
    const saved = data[key] || {};
    result[key] = {
      min: typeof saved.min === 'number' && !isNaN(saved.min) ? Math.max(0, Math.min(180, saved.min)) : def.min,
      max: typeof saved.max === 'number' && !isNaN(saved.max) ? Math.max(0, Math.min(180, saved.max)) : def.max,
      home: typeof saved.home === 'number' && !isNaN(saved.home) ? Math.max(0, Math.min(180, saved.home)) : def.home,
      inverted: typeof saved.inverted === 'boolean' ? saved.inverted : def.inverted
    };
    if (key === 'gripper') {
      result.gripper.release = gripCalib.release;
      result.gripper.grab = gripCalib.grab;
      result.gripper.min = Math.min(gripCalib.release, gripCalib.grab);
      result.gripper.max = Math.max(gripCalib.release, gripCalib.grab);
      result.gripper.inverted = gripCalib.inverted;
    }
  });

  return result;
}

/**
 * ดึงการ Calibrate ของแกนเดี่ยว
 */
function getAxisCalibration(axisKey) {
  const all = getAllCalibration();
  return all[axisKey] || DEFAULT_AXIS_CALIBRATION[axisKey] || { min: 0, max: 180, home: 90, inverted: false };
}

/**
 * บันทึก Calibrate ของแกนเดี่ยว
 */
function setAxisCalibration(axisKey, config) {
  const all = getAllCalibration();
  const minVal = Math.max(0, Math.min(180, parseInt(config.min, 10) || 0));
  const maxVal = Math.max(0, Math.min(180, parseInt(config.max, 10) || 180));
  const homeVal = Math.max(0, Math.min(180, parseInt(config.home, 10) || 90));
  const inv = Boolean(config.inverted);

  const realMin = Math.min(minVal, maxVal);
  const realMax = Math.max(minVal, maxVal);

  all[axisKey] = {
    min: realMin,
    max: realMax,
    home: homeVal,
    inverted: inv
  };

  if (axisKey === 'gripper') {
    const r = config.release !== undefined ? parseInt(config.release, 10) : realMin;
    const g = config.grab !== undefined ? parseInt(config.grab, 10) : realMax;
    all[axisKey].release = r;
    all[axisKey].grab = g;
    setGripperCalibration(r, g, inv);
  }

  localStorage.setItem('arm_all_calibration', JSON.stringify(all));

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('robot_calibration_change', {
      detail: { all, changedKey: axisKey }
    }));
  }
  return all[axisKey];
}

/**
 * บันทึก Calibrate ของทุกแกนพร้อมกัน
 */
function setAllCalibration(newConfig) {
  const current = getAllCalibration();
  Object.keys(newConfig).forEach(key => {
    if (current[key] && newConfig[key]) {
      const minVal = Math.max(0, Math.min(180, parseInt(newConfig[key].min, 10) || 0));
      const maxVal = Math.max(0, Math.min(180, parseInt(newConfig[key].max, 10) || 180));
      const homeVal = Math.max(0, Math.min(180, parseInt(newConfig[key].home, 10) || 90));
      const inv = Boolean(newConfig[key].inverted);

      const realMin = Math.min(minVal, maxVal);
      const realMax = Math.max(minVal, maxVal);

      current[key] = {
        min: realMin,
        max: realMax,
        home: homeVal,
        inverted: inv
      };

      if (key === 'gripper') {
        const r = newConfig[key].release !== undefined ? parseInt(newConfig[key].release, 10) : realMin;
        const g = newConfig[key].grab !== undefined ? parseInt(newConfig[key].grab, 10) : realMax;
        current[key].release = r;
        current[key].grab = g;
        setGripperCalibration(r, g, inv);
      }
    }
  });

  localStorage.setItem('arm_all_calibration', JSON.stringify(current));

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('robot_calibration_change', {
      detail: { all: current, changedKey: 'all' }
    }));
  }
  return current;
}

/**
 * รีเซ็ต Calibrate ของทุกแกน
 */
function resetAllCalibration() {
  localStorage.removeItem('arm_all_calibration');
  resetGripperCalibration();
  const defaults = JSON.parse(JSON.stringify(DEFAULT_AXIS_CALIBRATION));

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('robot_calibration_change', {
      detail: { all: defaults, changedKey: 'all' }
    }));
  }
  return defaults;
}

/**
 * ดึงขอบเขต Min/Max สำหรับ Slider ของ Gripper
 */
function getGripperLimits() {
  const calib = getGripperCalibration();
  const minLimit = Math.min(calib.release, calib.grab);
  const maxLimit = Math.max(calib.release, calib.grab);
  return {
    min: minLimit,
    max: maxLimit,
    release: calib.release,
    grab: calib.grab,
    inverted: calib.inverted
  };
}

/**
 * บันทึกค่ามุม Calibrate ของ Gripper
 */
function setGripperCalibration(release, grab, inverted = false) {
  const r = Math.max(0, Math.min(180, parseInt(release, 10) || 0));
  const g = Math.max(0, Math.min(180, parseInt(grab, 10) || 180));
  const inv = Boolean(inverted);

  localStorage.setItem('arm_gripper_release', r);
  localStorage.setItem('arm_gripper_grab', g);
  localStorage.setItem('arm_gripper_inverted', inv);
  
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('robot_gripper_calibration_change', {
      detail: { release: r, grab: g, inverted: inv }
    }));
  }
  return { release: r, grab: g, inverted: inv };
}

/**
 * รีเซ็ตค่า Calibrate ของ Gripper กลับสู่ค่ามาตรฐาน
 */
function resetGripperCalibration() {
  localStorage.removeItem('arm_gripper_release');
  localStorage.removeItem('arm_gripper_grab');
  localStorage.removeItem('arm_gripper_inverted');
  const defaults = { release: 30, grab: 140, inverted: false };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('robot_gripper_calibration_change', {
      detail: defaults
    }));
  }
  return defaults;
}

// ค่ามาตรฐานย้อนหลังสำหรับ 4-Axis
const ROBOT_HOME = getDefaultAngles(4);

window.ArmConfig = {
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_KEY,
  SUPABASE_URL,
  SUPABASE_KEY,
  createSupabaseClient,
  getSupabaseClient,
  SERVO_CONFIGS,
  DEFAULT_AXIS_CALIBRATION,
  getCurrentServoCount,
  setCurrentServoCount,
  getServoConfig,
  getDefaultAngles,
  getAllCalibration,
  getAxisCalibration,
  setAxisCalibration,
  setAllCalibration,
  resetAllCalibration,
  getGripperCalibration,
  getGripperLimits,
  setGripperCalibration,
  resetGripperCalibration,
  ROBOT_HOME
};
