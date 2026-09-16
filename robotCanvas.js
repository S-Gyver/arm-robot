/**
 * 2D Canvas Kinematic Visualizer for 4-Axis Robot Arm
 * Features: Forward kinematics rendering, smooth interpolation (lerp),
 * interactive joint indicators, realistic robotic limbs, and gripper claw animation.
 */

class RobotArmVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.error(`Canvas with id "${canvasId}" not found.`);
      return;
    }
    this.ctx = this.canvas.getContext('2d');
    
    // Target angles (received from controller)
    this.target = {
      base: 90,
      shoulder: 90,
      elbow: 90,
      gripper: 90
    };

    // Current animated angles (for smooth lerping)
    this.current = {
      base: 90,
      shoulder: 90,
      elbow: 90,
      gripper: 90
    };

    // Arm segment lengths in pixels (relative to canvas scale)
    this.segBaseHeight = 45;
    this.segUpperArm = 115;
    this.segForearm = 100;
    this.segWrist = 35;

    this.isRunning = false;
    this.initCanvas();
    this.startAnimation();

    window.addEventListener('resize', () => this.resize());
  }

  initCanvas() {
    this.resize();
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width || 480;
    this.height = Math.max(340, rect.height || 360);

    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
  }

  setAngles(base, shoulder, elbow, gripper) {
    if (base !== undefined) this.target.base = Number(base);
    if (shoulder !== undefined) this.target.shoulder = Number(shoulder);
    if (elbow !== undefined) this.target.elbow = Number(elbow);
    if (gripper !== undefined) this.target.gripper = Number(gripper);
  }

  startAnimation() {
    if (this.isRunning) return;
    this.isRunning = true;
    const loop = () => {
      this.update();
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  update() {
    // Lerp factor for smooth mechanical movement
    const lerpSpeed = 0.14;
    this.current.base += (this.target.base - this.current.base) * lerpSpeed;
    this.current.shoulder += (this.target.shoulder - this.current.shoulder) * lerpSpeed;
    this.current.elbow += (this.target.elbow - this.current.elbow) * lerpSpeed;
    this.current.gripper += (this.target.gripper - this.current.gripper) * lerpSpeed;
  }

  draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    // 1. Draw Tech Background Grid
    this.drawGrid(ctx, w, h);

    // 2. Draw Top-Down Mini Compass for Base Rotation
    this.drawBaseCompass(ctx, w - 75, 75, 45, this.current.base);

    // 3. Coordinate System & Base Origin
    // Base is located near bottom center
    const baseX = w * 0.42;
    const baseY = h * 0.82;

    // Ground platform shadow
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(baseX, baseY + 18, 120, 16, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.filter = 'blur(6px)';
    ctx.fill();
    ctx.restore();

    // Draw Ground Pedestal
    this.drawPedestal(ctx, baseX, baseY);

    // 4. Calculate Forward Kinematics
    // Angles in degrees to radians:
    // Base rotation introduces a slight skew / perspective depth or is reflected in arm projection
    const baseRad = (this.current.base - 90) * (Math.PI / 180);
    
    // Shoulder: 0 to 180 deg. 90 is upright vertical
    // 0 is forward flat, 180 is backward
    const shoulderRad = (180 - this.current.shoulder) * (Math.PI / 180);

    // Joint 1: Shoulder pivot
    const j1x = baseX;
    const j1y = baseY - this.segBaseHeight;

    // Joint 2: Elbow pivot
    const j2x = j1x + Math.cos(shoulderRad) * this.segUpperArm;
    const j2y = j1y - Math.sin(shoulderRad) * this.segUpperArm;

    // Elbow: 0 to 180 deg relative to shoulder
    const elbowRad = shoulderRad - (this.current.elbow - 90) * (Math.PI / 180);

    // Joint 3: Wrist
    const j3x = j2x + Math.cos(elbowRad) * this.segForearm;
    const j3y = j2y - Math.sin(elbowRad) * this.segForearm;

    // Gripper Tip Direction
    const tipX = j3x + Math.cos(elbowRad) * this.segWrist;
    const tipY = j3y - Math.sin(elbowRad) * this.segWrist;

    // Draw Link 1: Upper Arm (Shoulder to Elbow)
    this.drawArmSegment(ctx, j1x, j1y, j2x, j2y, '#3b82f6', '#1d4ed8', 18);

    // Draw Link 2: Forearm (Elbow to Wrist)
    this.drawArmSegment(ctx, j2x, j2y, j3x, j3y, '#8b5cf6', '#6d28d9', 14);

    // Draw Joint Pivots
    this.drawJointPivot(ctx, j1x, j1y, 14, '#60a5fa', 'SHOULDER');
    this.drawJointPivot(ctx, j2x, j2y, 12, '#a78bfa', 'ELBOW');
    this.drawJointPivot(ctx, j3x, j3y, 8, '#f43f5e', 'WRIST');

    // Draw Gripper Claw (opening/closing according to gripper angle 0-180)
    this.drawGripperClaw(ctx, j3x, j3y, elbowRad, this.current.gripper);

    // End-Effector Telemetry Overlay
    this.drawTelemetryHUD(ctx, 16, 26, tipX, tipY, baseX, baseY);
  }

  drawGrid(ctx, w, h) {
    ctx.save();
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.07)';
    ctx.lineWidth = 1;

    const step = 28;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Floor line
    const floorY = h * 0.82 + 18;
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, floorY);
    ctx.lineTo(w - 10, floorY);
    ctx.stroke();

    ctx.restore();
  }

  drawPedestal(ctx, x, y) {
    ctx.save();
    // Base foundation
    const grad = ctx.createLinearGradient(x - 50, y, x + 50, y);
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(0.5, '#334155');
    grad.addColorStop(1, '#0f172a');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x - 45, y, 90, 18, 6);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Base rotating column
    const colGrad = ctx.createLinearGradient(x - 22, y - this.segBaseHeight, x + 22, y);
    colGrad.addColorStop(0, '#38bdf8');
    colGrad.addColorStop(0.3, '#0284c7');
    colGrad.addColorStop(1, '#0369a1');

    ctx.fillStyle = colGrad;
    ctx.beginPath();
    ctx.roundRect(x - 22, y - this.segBaseHeight, 44, this.segBaseHeight + 2, 4);
    ctx.fill();

    // Cyber accent lines
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 14, y - this.segBaseHeight + 10);
    ctx.lineTo(x + 14, y - this.segBaseHeight + 10);
    ctx.stroke();

    ctx.restore();
  }

  drawArmSegment(ctx, x1, y1, x2, y2, colorStart, colorEnd, thickness) {
    ctx.save();
    const dx = x2 - x1;
    const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);
    const dist = Math.hypot(dx, dy);

    ctx.translate(x1, y1);
    ctx.rotate(angle);

    // Arm body gradient
    const grad = ctx.createLinearGradient(0, -thickness / 2, 0, thickness / 2);
    grad.addColorStop(0, colorStart);
    grad.addColorStop(0.4, '#f8fafc');
    grad.addColorStop(0.6, colorStart);
    grad.addColorStop(1, colorEnd);

    // Main bone
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(0, -thickness / 2, dist, thickness, thickness / 2);
    ctx.fill();

    // Cyber border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Structural hollow slot
    if (dist > 50) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.beginPath();
      ctx.roundRect(dist * 0.25, -thickness * 0.22, dist * 0.5, thickness * 0.44, 3);
      ctx.fill();
    }

    ctx.restore();
  }

  drawJointPivot(ctx, x, y, radius, glowColor, label) {
    ctx.save();
    // Glow ring
    ctx.beginPath();
    ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
    ctx.fill();

    // Core circle
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 1, x, y, radius);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, glowColor);
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Center LED
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#22c55e';
    ctx.fill();

    ctx.restore();
  }

  drawGripperClaw(ctx, x, y, angle, gripperAngle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Gripper Angle: 0 = Open wide (~35 deg spread), 180 = Clamped tight (~4 deg spread)
    const normalized = Math.max(0, Math.min(180, gripperAngle)) / 180;
    const spread = (1 - normalized) * 0.55 + 0.08; // in radians

    // Wrist mount block
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, -9, 12, 18);

    // Claw 1 (Upper finger)
    ctx.save();
    ctx.rotate(-spread);
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.moveTo(10, -5);
    ctx.lineTo(34, -12);
    ctx.lineTo(38, -4);
    ctx.lineTo(24, -2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#6ee7b7';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Claw 2 (Lower finger)
    ctx.save();
    ctx.rotate(spread);
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.moveTo(10, 5);
    ctx.lineTo(34, 12);
    ctx.lineTo(38, 4);
    ctx.lineTo(24, 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#6ee7b7';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  drawBaseCompass(ctx, cx, cy, radius, baseAngle) {
    ctx.save();
    // Dial background
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Tick marks for 0, 90, 180
    ctx.font = '9px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('0°', cx - radius + 10, cy);
    ctx.fillText('180°', cx + radius - 12, cy);
    ctx.fillText('90°', cx, cy - radius + 8);
    ctx.fillText('BASE DIAL', cx, cy + radius + 12);

    // Rotation needle
    // 0 deg = Left, 90 deg = Up, 180 deg = Right
    const rad = (baseAngle - 180) * (Math.PI / 180);
    const nx = cx + Math.cos(rad) * (radius - 10);
    const ny = cy + Math.sin(rad) * (radius - 10);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Center pivot
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Angle text badge inside compass
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`${Math.round(baseAngle)}°`, cx, cy + 18);

    ctx.restore();
  }

  drawTelemetryHUD(ctx, x, y, tipX, tipY, baseX, baseY) {
    ctx.save();
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#0284c7';
    ctx.fillText('● 2D KINEMATICS ENGINE', x, y);

    const relX = Math.round(tipX - baseX);
    const relY = Math.round(baseY - tipY);

    ctx.font = '11px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`TIP POS : X: ${relX > 0 ? '+' : ''}${relX}px  |  Y: +${relY}px`, x, y + 16);
    ctx.restore();
  }
}

window.RobotArmVisualizer = RobotArmVisualizer;
