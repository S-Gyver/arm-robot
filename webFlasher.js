/**
 * Web Serial ESP32 Firmware Flasher
 * อนุญาตให้แฟลชเฟิร์มแวร์หุ่นยนต์ลงบอร์ด ESP32 ผ่านเบราว์เซอร์โดยตรงด้วย Web Serial API และ esptool-js
 * ไม่จำเป็นต้องติดตั้ง Arduino IDE หรือไดรเวอร์ที่ซับซ้อนในคอมพิวเตอร์
 */

(function () {
  const MODAL_ID = 'modal-web-flasher';
  let esptoolClient = null;
  let transport = null;
  let isFlashing = false;

  // โหลด esptool-js อัตโนมัติจาก CDN หากยังไม่มี
  function loadEsptoolScript(callback) {
    if (window.esptooljs) {
      if (callback) callback();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/esptool-js@0.5.4/bundle.js';
    script.onload = () => {
      console.log('✅ esptool-js library loaded successfully');
      if (callback) callback();
    };
    script.onerror = () => {
      console.warn('⚠️ Could not load esptool-js from primary CDN, trying fallback...');
      const fallbackScript = document.createElement('script');
      fallbackScript.src = 'https://cdn.jsdelivr.net/npm/esptool-js@0.5.4/bundle.js';
      fallbackScript.onload = () => { if (callback) callback(); };
      document.head.appendChild(fallbackScript);
    };
    document.head.appendChild(script);
  }

  // สร้าง Modal สำหรับ Web Flasher
  function ensureModalExists() {
    if (document.getElementById(MODAL_ID)) return;

    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 hidden select-none overflow-y-auto';
    modal.innerHTML = `
      <div class="max-w-xl w-full glass-panel rounded-2xl p-5 sm:p-6 border border-cyan-500/30 shadow-2xl shadow-cyan-500/10 space-y-4 my-auto">
        
        <!-- Header -->
        <div class="flex items-center justify-between pb-3 border-b border-white/10">
          <div class="flex items-center gap-2.5">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-cyan-500/25">
              <i data-lucide="zap" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 class="font-bold text-base sm:text-lg text-white flex items-center gap-2">
                <span>ติดตั้งเฟิร์มแวร์ลงบอร์ด ESP32 (Web Flasher)</span>
              </h3>
              <p class="text-[11px] text-slate-400">เขียนโปรแกรมควบคุมแขนกลลงบอร์ดผ่าน USB ทันที ไม่ต้องลง Arduino IDE</p>
            </div>
          </div>
          <button onclick="closeWebFlasherModal()" class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <!-- Firmware Info Card -->
        <div class="bg-slate-900/80 p-3.5 rounded-xl border border-white/10 space-y-2.5 text-xs">
          <div class="flex items-center justify-between">
            <span class="font-bold text-slate-200 flex items-center gap-1.5">
              <i data-lucide="cpu" class="w-4 h-4 text-cyan-400"></i>
              <span>ESP32 Robot Arm Universal Firmware</span>
            </span>
            <span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono-tech text-[10px] font-bold border border-emerald-500/30">
              v2.5 Ready
            </span>
          </div>

          <div class="grid grid-cols-2 gap-2 text-[11px] text-slate-400 font-mono-tech">
            <div class="bg-slate-950/60 p-2 rounded-lg border border-white/5">
              <span class="text-slate-500 block text-[10px]">ชิปเป้าหมาย:</span>
              <span class="text-cyan-300 font-bold">ESP32 (Standard DevKit)</span>
            </div>
            <div class="bg-slate-950/60 p-2 rounded-lg border border-white/5">
              <span class="text-slate-500 block text-[10px]">จำนวน Servo ที่รองรับ:</span>
              <span class="text-emerald-300 font-bold">2 - 6 เซอร์โว (Auto)</span>
            </div>
          </div>

          <p class="text-[11px] text-slate-400 leading-relaxed">
            ⚡ ขาใช้งาน: S1: GPIO16, S2: GPIO17, S3: GPIO18, S4: GPIO19, S5: GPIO21, S6: GPIO22 (115200 BAUD)
          </p>
        </div>

        <!-- Step Instructions -->
        <div class="p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-200 text-xs leading-relaxed space-y-1">
          <div class="font-bold text-cyan-300 flex items-center gap-1.5">
            <i data-lucide="info" class="w-4 h-4"></i> วิธีการติดตั้ง:
          </div>
          <ol class="list-decimal list-inside space-y-0.5 text-[11px] text-cyan-100/90 pl-1">
            <li>เสียบสาย USB ของบอร์ด ESP32 เข้ากับคอมพิวเตอร์</li>
            <li>กดปุ่ม <b>"เริ่มติดตั้งลงบอร์ด"</b> ด้านล่าง และเลือก COM Port ในหน้าต่างเบราว์เซอร์</li>
            <li>รอหลอดโหลดจนครบ 100% บอร์ดจะรีบูตพร้อมขยับแขนกลได้ทันที!</li>
          </ol>
        </div>

        <!-- Progress Bar Strip -->
        <div id="flasher-progress-box" class="space-y-1.5 hidden">
          <div class="flex items-center justify-between text-xs">
            <span id="flasher-status-label" class="font-bold text-cyan-400 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              <span id="flasher-status-text">กำลังเชื่อมต่อกับบอร์ด...</span>
            </span>
            <span id="flasher-percent-text" class="font-mono-tech font-bold text-cyan-300">0%</span>
          </div>
          <div class="w-full h-3 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-white/10">
            <div id="flasher-progress-bar" class="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full transition-all duration-150 w-0"></div>
          </div>
        </div>

        <!-- Flasher Terminal Console -->
        <div class="space-y-1">
          <div class="flex items-center justify-between text-[11px] text-slate-400 px-1">
            <span class="flex items-center gap-1">
              <i data-lucide="terminal" class="w-3.5 h-3.5 text-cyan-400"></i> Output Log:
            </span>
            <button type="button" onclick="clearFlasherLog()" class="hover:text-white transition">Clear</button>
          </div>
          <div id="flasher-terminal" class="h-28 overflow-y-auto bg-slate-950 p-2.5 rounded-xl border border-white/10 font-mono-tech text-[10px] text-slate-300 space-y-0.5 leading-tight">
            <div class="text-slate-500">พร้อมเชื่อมต่อ... เสียบสาย USB แล้วกดปุ่มติดตั้ง</div>
          </div>
        </div>

        <!-- Footer Buttons -->
        <div class="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
          <button type="button" onclick="closeWebFlasherModal()" class="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition">
            ปิดหน้าต่าง
          </button>

          <button id="btn-start-flash" type="button" onclick="startEsp32WebFlash()" class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-cyan-500/25 active:scale-95 transition">
            <i data-lucide="zap" class="w-4 h-4"></i>
            <span>เริ่มติดตั้งลงบอร์ด (Flash Firmware)</span>
          </button>
        </div>

      </div>
    `;

    document.body.appendChild(modal);
    if (window.lucide) window.lucide.createIcons();
  }

  function logToTerminal(msg, colorClass = 'text-slate-300') {
    const term = document.getElementById('flasher-terminal');
    if (!term) return;
    const line = document.createElement('div');
    line.className = colorClass;
    line.textContent = msg;
    term.appendChild(line);
    term.scrollTop = term.scrollHeight;
  }

  window.clearFlasherLog = function () {
    const term = document.getElementById('flasher-terminal');
    if (term) term.innerHTML = '<div class="text-slate-500">Log cleared.</div>';
  };

  window.openWebFlasherModal = function () {
    ensureModalExists();
    loadEsptoolScript();
    const modal = document.getElementById(MODAL_ID);
    if (modal) modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  };

  window.closeWebFlasherModal = function () {
    if (isFlashing) {
      if (!confirm('กำลังอยู่ในระหว่างติดตั้งเฟิร์มแวร์ ต้องการยกเลิกหรือไม่?')) return;
    }
    const modal = document.getElementById(MODAL_ID);
    if (modal) modal.classList.add('hidden');
  };

  // ดึงไฟล์ Binary ของ Firmware มาเป็น ArrayBuffer / Uint8Array
  async function fetchBinaryFile(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ไม่พบไฟล์ ${url} (HTTP ${response.status})`);
    }
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  // เริ่มกระบวนการ Flash ลง ESP32
  window.startEsp32WebFlash = async function () {
    if (isFlashing) return;

    if (!navigator.serial) {
      alert('เบราว์เซอร์นี้ไม่รองรับ Web Serial API กรุณาใช้งานผ่าน Google Chrome หรือ Microsoft Edge');
      return;
    }

    const btn = document.getElementById('btn-start-flash');
    const progressBox = document.getElementById('flasher-progress-box');
    const progressBar = document.getElementById('flasher-progress-bar');
    const percentText = document.getElementById('flasher-percent-text');
    const statusText = document.getElementById('flasher-status-text');

    // ถ้า Host เชื่อมต่อ Serial อยู่ ให้ตัดการเชื่อมต่อก่อนชั่วคราว
    if (window.hostApp && window.hostApp.serial && window.hostApp.serial.isConnected) {
      logToTerminal('🔌 กำลังตัดการเชื่อมต่อ Serial ของหน้า Host ชั่วคราว...', 'text-amber-400');
      try {
        await window.hostApp.serial.disconnect();
      } catch (e) { /* ignore */ }
    }

    try {
      isFlashing = true;
      if (btn) {
        btn.disabled = true;
        btn.className = 'px-5 py-2.5 rounded-xl bg-slate-800 text-slate-500 font-bold text-xs sm:text-sm flex items-center gap-2 cursor-not-allowed';
      }
      if (progressBox) progressBox.classList.remove('hidden');
      if (progressBar) progressBar.style.width = '0%';
      if (percentText) percentText.textContent = '0%';
      if (statusText) statusText.textContent = 'กำลังขอสิทธิ์เลือกพอร์ต USB...';

      logToTerminal('⏳ กำลังเปิดหน้าต่างเลือก COM Port...', 'text-cyan-400');
      const port = await navigator.serial.requestPort();

      logToTerminal('🔗 เชื่อมต่อพอร์ต USB แล้ว กำลังเตรียม esptool-js...', 'text-cyan-300');
      statusText.textContent = 'กำลังเชื่อมต่อกับ Bootloader ของ ESP32...';

      // โหลด esptool-js หากยังไม่พร้อม
      if (!window.esptooljs) {
        await new Promise((resolve) => loadEsptoolScript(resolve));
      }

      const ESPLoader = window.esptooljs ? window.esptooljs.ESPLoader : null;
      const Transport = window.esptooljs ? window.esptooljs.Transport : null;

      if (!ESPLoader || !Transport) {
        throw new Error('ไม่สามารถโหลดไลบรารี esptool-js ได้ กรุณาเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่');
      }

      transport = new Transport(port);

      const terminalObj = {
        clean: () => {},
        writeLine: (data) => logToTerminal(data, 'text-slate-300'),
        write: (data) => logToTerminal(data, 'text-slate-400')
      };

      esptoolClient = new ESPLoader({
        transport: transport,
        baudrate: 115200,
        terminal: terminalObj,
        romBaudrate: 115200
      });

      logToTerminal('🔄 กำลังซิงค์กับชิป ESP32 (Auto Sync)...', 'text-cyan-300');
      const chip = await esptoolClient.main();
      logToTerminal(`✅ ตรวจพบชิป: ${chip}`, 'text-emerald-400');

      statusText.textContent = 'กำลังดาวน์โหลดไฟล์เฟิร์มแวร์เข้าเบราว์เซอร์...';
      logToTerminal('📦 กำลังโหลดชุดไฟล์ไบนารีสำหรับ ESP32...', 'text-cyan-300');

      // โหลดไฟล์ไบนารี 4 ส่วนมาตรฐานของ ESP32
      const bootloaderData = await fetchBinaryFile('firmware/bootloader.bin');
      const partitionsData = await fetchBinaryFile('firmware/partitions.bin');
      const bootApp0Data = await fetchBinaryFile('firmware/boot_app0.bin');
      const firmwareData = await fetchBinaryFile('firmware/firmware.bin');

      // แปลงเป็น binary string สำหรับ esptool-js
      function uint8ToBinaryString(u8Array) {
        let binary = '';
        const len = u8Array.byteLength;
        const chunkSize = 8192;
        for (let i = 0; i < len; i += chunkSize) {
          const chunk = u8Array.subarray(i, Math.min(i + chunkSize, len));
          binary += String.fromCharCode.apply(null, chunk);
        }
        return binary;
      }

      const fileArray = [
        { data: uint8ToBinaryString(bootloaderData), address: 0x1000 },
        { data: uint8ToBinaryString(partitionsData), address: 0x8000 },
        { data: uint8ToBinaryString(bootApp0Data), address: 0xe000 },
        { data: uint8ToBinaryString(firmwareData), address: 0x10000 }
      ];

      statusText.textContent = 'กำลังแฟลชเฟิร์มแวร์ลง Flash Memory...';
      logToTerminal('🚀 เริ่มต้นการเขียนข้อมูลลงชิป (Baud: 460800 bps)...', 'text-emerald-400');

      await esptoolClient.writeFlash({
        fileArray: fileArray,
        flashSize: 'keep',
        eraseAll: false,
        compress: true,
        reportProgress: (fileIndex, written, total) => {
          const percent = Math.round((written / total) * 100);
          if (progressBar) progressBar.style.width = `${percent}%`;
          if (percentText) percentText.textContent = `${percent}%`;
          if (statusText) statusText.textContent = `กำลังเขียนไฟล์ที่ ${fileIndex + 1}/4 (${percent}%)...`;
        },
        calculateMD5Hash: (image) => window.CryptoJS ? window.CryptoJS.MD5(CryptoJS.enc.Latin1.parse(image)).toString() : ''
      });

      logToTerminal('✨ แฟลชข้อมูลเสร็จสมบูรณ์ 100%!', 'text-emerald-400');
      statusText.textContent = 'ติดตั้งเรียบร้อย! กำลังรีบูตบอร์ด...';

      // สั่ง Reset ชิป
      try {
        await esptoolClient.hardReset();
      } catch (e) { /* ignore */ }

      try {
        await transport.disconnect();
      } catch (e) { /* ignore */ }

      if (progressBar) progressBar.style.width = '100%';
      if (percentText) percentText.textContent = '100%';
      statusText.textContent = '✅ ติดตั้งสำเร็จ! บอร์ดพร้อมใช้งานทันที';
      logToTerminal('🎉 ยินดีด้วย! ติดตั้งเฟิร์มแวร์ลง ESP32 สำเร็จแล้ว คุณสามารถกดเชื่อมต่อและสั่งงานแขนกลได้เลย', 'text-emerald-300 font-bold');

      alert('🎉 ติดตั้งโปรแกรมลงบอร์ด ESP32 สำเร็จเรียบร้อยแล้ว!\nสามารถกดปุ่ม "เชื่อมต่อ ESP32" บนหน้าเว็บเพื่อเริ่มควบคุมหุ่นยนต์ได้ทันที');

    } catch (err) {
      console.error('❌ Flash Error:', err);
      logToTerminal(`❌ เกิดข้อผิดพลาด: ${err.message || err}`, 'text-rose-400 font-bold');
      if (statusText) statusText.textContent = 'เกิดข้อผิดพลาดในการติดตั้ง';
      alert(`การติดตั้งล้มเหลว: ${err.message || err}\n\n💡 คำแนะนำ: หากบอร์ดไม่เข้าโหมดดาวน์โหลด ให้กดปุ่ม BOOT บนบอร์ด ESP32 ค้างไว้ตอนเริ่มเชื่อมต่อ`);
    } finally {
      isFlashing = false;
      if (btn) {
        btn.disabled = false;
        btn.className = 'px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-cyan-500/25 active:scale-95 transition';
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureModalExists);
  } else {
    ensureModalExists();
  }
})();
