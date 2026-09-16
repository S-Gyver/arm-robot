/**
 * Global Configuration for 4-Axis Robot Arm Web App
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

// ค่ามาตรฐานของตำแหน่งหุ่นยนต์ (Home Position)
const ROBOT_HOME = {
  base: 90,
  shoulder: 90,
  elbow: 90,
  gripper: 90
};

// ค่าขอบเขตองศาของ Servo แต่ละแกน
const SERVO_LIMITS = {
  base: { min: 0, max: 180, name: 'Base Rotation (ฐานหมุน)' },
  shoulder: { min: 0, max: 180, name: 'Shoulder Axis (หัวไหล่)' },
  elbow: { min: 0, max: 180, name: 'Elbow Axis (ข้อศอก)' },
  gripper: { min: 0, max: 180, name: 'Gripper (มือจับ)' }
};

window.ArmConfig = {
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_KEY,
  SUPABASE_URL,
  SUPABASE_KEY,
  createSupabaseClient,
  getSupabaseClient,
  ROBOT_HOME,
  SERVO_LIMITS
};
