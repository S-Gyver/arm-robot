/**
 * 2D Canvas Kinematic Visualizer for Multi-Axis Robot Arm
 * Supports 2, 3, 4, 5, and 6 Servos configurations
 * Features: Forward kinematics rendering, smooth interpolation (lerp),
 * interactive joint indicators, realistic robotic limbs, and gripper claw animation.
 */

class RobotArmVisualizer {
  constructor(canvasId, servoCount = 4) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.error(`Canvas with id "${canvasId}" not found.`);
      return;
    }
    this.ctx = this.canvas.getContext('2d');
    this.servoCount = servoCount || (window.ArmConfig ? window.ArmConfig.getCurrentServoCount() : 4);

    // Initial angles map
    this.initAngleState();

    // Arm segment lengths in pixels (relative to canvas scale)
    this.segBaseHeight = 45;
    this.segUpperArm = 110;
    this.segForearm = 95;
    this.segWrist = 45;
    this.segWristRoll = 25;

    this.isRunning = false;
    this.initCanvas();
    this.startAnimation();

    window.addEventListener('resize', () => this.resize());
  }

  initAngleState() {
    const defaultAngles = window.ArmConfig ? window.ArmConfig.getDefaultAngles(this.servoCount) : { base: 90, shoulder: 90, elbow: 90, gripper: 90 };
    this.target = { ...defaultAngles };
    this.current = { ...defaultAngles };
  }

  setServoCount(count) {
    const n = parseInt(count, 10);
    if ([2, 3, 4, 5, 6].includes(n)) {
      this.servoCount = n;
      const defaultAngles = window.ArmConfig ? window.ArmConfig.getDefaultAngles(n) : {};
      // Preserve existing angles if present
      for (const k in defaultAngles) {
        if (this.target[k] === undefined) {
          this.target[k] = defaultAngles[k];
        }
        if (this.current[k] === undefined) {
          this.current[k] = defaultAngles[k];
        }
      }
    }
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

  setAngles(...args) {
    if (args.length === 0) return;
    if (typeof args[0] === 'object' && args[0] !== null) {
      // If object passed e.g. { base: 90, shoulder: 90, ... }
      for (const k in args[0]) {
        if (args[0][k] !== undefined) {
          this.target[k] = Number(args[0][k]);
          if (this.current[k] === undefined) {
            this.current[k] = this.target[k];
          }
        }
      }
    } else {
      // If positional arguments passed
      const cfg = window.ArmConfig ? window.ArmConfig.getServoConfig(this.servoCount) : null;
      if (cfg && cfg.axes) {
        cfg.axes.forEach((axis, i) => {
          if (args[i] !== undefined) {
            this.target[axis.key] = Number(args[i]);
            if (this.current[axis.key] === undefined) {
              this.current[axis.key] = this.target[axis.key];
            }
          }
        });
      }
    }
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
    const lerpSpeed = 0.28;
    for (const k in this.target) {
      if (this.current[k] === undefined) this.current[k] = this.target[k];
      const diff = this.target[k] - this.current[k];
      if (Math.abs(diff) < 0.05) {
        this.current[k] = this.target[k];
      } else {
        this.current[k] += diff * lerpSpeed;
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    // 1. Draw Tech Background Grid
    this.drawGrid(ctx, w, h);

    const baseVal = this.current.base !== undefined ? this.current.base : 90;

    // 2. Draw Top-Down Mini Compass for Base Rotation
    this.drawBaseCompass(ctx, w - 75, 75, 45, baseVal);

    // 3. Coordinate System & Base Origin
    const baseX = w * 0.40;
    const baseY = h * 0.82;

    // Ground platform shadow
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(baseX, baseY + 18, 125, 16, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.filter = 'blur(6px)';
    ctx.fill();
    ctx.restore();

    // Draw Ground Pedestal
    this.drawPedestal(ctx, baseX, baseY);

    // 4. Calculate Forward Kinematics based on active servo count
    const count = this.servoCount;
    const j1x = baseX;
    const j1y = baseY - this.segBaseHeight;

    let tipX = j1x;
    let tipY = j1y;
    let endAngle = 0;
    let gripperAngle = 90;

    if (count === 2) {
      // 2 Servos: Base + Gripper (Rotates and clamps right at base mount, or small tilt)
      const gripperVal = this.current.gripper !== undefined ? this.current.gripper : 90;
      gripperAngle = gripperVal;
      const armLength = 80;
      const angleRad = 0; // facing forward/upright
      tipX = j1x + Math.cos(angleRad) * armLength;
      tipY = j1y - Math.sin(angleRad) * armLength;
      endAngle = angleRad;

      this.drawArmSegment(ctx, j1x, j1y, tipX, tipY, '#3b82f6', '#1d4ed8', 18);
      this.drawJointPivot(ctx, j1x, j1y, 14, '#60a5fa', 'BASE');
      this.drawJointPivot(ctx, tipX, tipY, 10, '#10b981', 'GRIPPER');
      this.drawGripperClaw(ctx, tipX, tipY, endAngle, gripperAngle);

    } else if (count === 3) {
      // 3 Servos: Base + Shoulder + Gripper
      const shoulderVal = this.current.shoulder !== undefined ? this.current.shoulder : 90;
      const gripperVal = this.current.gripper !== undefined ? this.current.gripper : 90;
      gripperAngle = gripperVal;

      const shoulderRad = (180 - shoulderVal) * (Math.PI / 180);
      const armLength = 160;
      tipX = j1x + Math.cos(shoulderRad) * armLength;
      tipY = j1y - Math.sin(shoulderRad) * armLength;
      endAngle = shoulderRad;

      this.drawArmSegment(ctx, j1x, j1y, tipX, tipY, '#8b5cf6', '#6d28d9', 18);
      this.drawJointPivot(ctx, j1x, j1y, 14, '#a78bfa', 'SHOULDER');
      this.drawJointPivot(ctx, tipX, tipY, 10, '#10b981', 'GRIPPER');
      this.drawGripperClaw(ctx, tipX, tipY, endAngle, gripperAngle);

    } else if (count === 4) {
      // 4 Servos: Base + Shoulder + Elbow + Gripper (Standard)
      const shoulderVal = this.current.shoulder !== undefined ? this.current.shoulder : 90;
      const elbowVal = this.current.elbow !== undefined ? this.current.elbow : 90;
      gripperAngle = this.current.gripper !== undefined ? this.current.gripper : 90;

      const shoulderRad = (180 - shoulderVal) * (Math.PI / 180);
      const j2x = j1x + Math.cos(shoulderRad) * this.segUpperArm;
      const j2y = j1y - Math.sin(shoulderRad) * this.segUpperArm;

      const elbowRad = shoulderRad - (elbowVal - 90) * (Math.PI / 180);
      const j3x = j2x + Math.cos(elbowRad) * this.segForearm;
      const j3y = j2y - Math.sin(elbowRad) * this.segForearm;

      tipX = j3x;
      tipY = j3y;
      endAngle = elbowRad;

      this.drawArmSegment(ctx, j1x, j1y, j2x, j2y, '#8b5cf6', '#6d28d9', 18);
      this.drawArmSegment(ctx, j2x, j2y, j3x, j3y, '#06b6d4', '#0891b2', 14);

      this.drawJointPivot(ctx, j1x, j1y, 14, '#a78bfa', 'SHOULDER');
      this.drawJointPivot(ctx, j2x, j2y, 12, '#22d3ee', 'ELBOW');
      this.drawJointPivot(ctx, j3x, j3y, 8, '#10b981', 'WRIST');

      this.drawGripperClaw(ctx, j3x, j3y, endAngle, gripperAngle);

    } else if (count === 5) {
      // 5 Servos: Base + Shoulder + Elbow + WristPitch + Gripper
      const shoulderVal = this.current.shoulder !== undefined ? this.current.shoulder : 90;
      const elbowVal = this.current.elbow !== undefined ? this.current.elbow : 90;
      const wristPitchVal = this.current.wristPitch !== undefined ? this.current.wristPitch : 90;
      gripperAngle = this.current.gripper !== undefined ? this.current.gripper : 90;

      const shoulderRad = (180 - shoulderVal) * (Math.PI / 180);
      const j2x = j1x + Math.cos(shoulderRad) * (this.segUpperArm * 0.95);
      const j2y = j1y - Math.sin(shoulderRad) * (this.segUpperArm * 0.95);

      const elbowRad = shoulderRad - (elbowVal - 90) * (Math.PI / 180);
      const j3x = j2x + Math.cos(elbowRad) * (this.segForearm * 0.9);
      const j3y = j2y - Math.sin(elbowRad) * (this.segForearm * 0.9);

      const wristRad = elbowRad - (wristPitchVal - 90) * (Math.PI / 180);
      const j4x = j3x + Math.cos(wristRad) * this.segWrist;
      const j4y = j3y - Math.sin(wristRad) * this.segWrist;

      tipX = j4x;
      tipY = j4y;
      endAngle = wristRad;

      this.drawArmSegment(ctx, j1x, j1y, j2x, j2y, '#8b5cf6', '#6d28d9', 18);
      this.drawArmSegment(ctx, j2x, j2y, j3x, j3y, '#06b6d4', '#0891b2', 14);
      this.drawArmSegment(ctx, j3x, j3y, j4x, j4y, '#f59e0b', '#d97706', 10);

      this.drawJointPivot(ctx, j1x, j1y, 14, '#a78bfa', 'SHOULDER');
      this.drawJointPivot(ctx, j2x, j2y, 12, '#22d3ee', 'ELBOW');
      this.drawJointPivot(ctx, j3x, j3y, 9, '#fbbf24', 'WRIST');
      this.drawJointPivot(ctx, j4x, j4y, 7, '#10b981', 'TOOL');

      this.drawGripperClaw(ctx, j4x, j4y, endAngle, gripperAngle);

    } else if (count === 6) {
      // 6 Servos: Base + Shoulder + Elbow + WristPitch + WristRoll + Gripper
      const shoulderVal = this.current.shoulder !== undefined ? this.current.shoulder : 90;
      const elbowVal = this.current.elbow !== undefined ? this.current.elbow : 90;
      const wristPitchVal = this.current.wristPitch !== undefined ? this.current.wristPitch : 90;
      const wristRollVal = this.current.wristRoll !== undefined ? this.current.wristRoll : 90;
      gripperAngle = this.current.gripper !== undefined ? this.current.gripper : 90;

      const shoulderRad = (180 - shoulderVal) * (Math.PI / 180);
      const j2x = j1x + Math.cos(shoulderRad) * (this.segUpperArm * 0.92);
      const j2y = j1y - Math.sin(shoulderRad) * (this.segUpperArm * 0.92);

      const elbowRad = shoulderRad - (elbowVal - 90) * (Math.PI / 180);
      const j3x = j2x + Math.cos(elbowRad) * (this.segForearm * 0.85);
      const j3y = j2y - Math.sin(elbowRad) * (this.segForearm * 0.85);

      const wristRad = elbowRad - (wristPitchVal - 90) * (Math.PI / 180);
      const j4x = j3x + Math.cos(wristRad) * this.segWrist;
      const j4y = j3y - Math.sin(wristRad) * this.segWrist;

      // Wrist roll collar indicator
      const j5x = j4x + Math.cos(wristRad) * this.segWristRoll;
      const j5y = j4y - Math.sin(wristRad) * this.segWristRoll;

      tipX = j5x;
      tipY = j5y;
      endAngle = wristRad;

      this.drawArmSegment(ctx, j1x, j1y, j2x, j2y, '#8b5cf6', '#6d28d9', 18);
      this.drawArmSegment(ctx, j2x, j2y, j3x, j3y, '#06b6d4', '#0891b2', 14);
      this.drawArmSegment(ctx, j3x, j3y, j4x, j4y, '#f59e0b', '#d97706', 10);
      this.drawArmSegment(ctx, j4x, j4y, j5x, j5y, '#f43f5e', '#be123c', 8);

      // Roll indicator ring
      this.drawRollIndicator(ctx, j4x, j4y, wristRad, wristRollVal);

      this.drawJointPivot(ctx, j1x, j1y, 14, '#a78bfa', 'SHOULDER');
      this.drawJointPivot(ctx, j2x, j2y, 12, '#22d3ee', 'ELBOW');
      this.drawJointPivot(ctx, j3x, j3y, 9, '#fbbf24', 'W-PITCH');
      this.drawJointPivot(ctx, j4x, j4y, 7, '#fb7185', 'W-ROLL');

      this.drawGripperClaw(ctx, j5x, j5y, endAngle, gripperAngle);
    }

    // End-Effector Telemetry Overlay
    this.drawTelemetryHUD(ctx, 16, 26, tipX, tipY, baseX, baseY, count);
  }

  drawRollIndicator(ctx, x, y, armAngle, rollAngle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(armAngle);
    // Draw rotating collar ring
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 4, 10, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Small indicator dot for roll position
    const rollRad = (rollAngle - 90) * (Math.PI / 180);
    const dotY = Math.sin(rollRad) * 8;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, dotY, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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
    if (dist > 40) {
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

    // Gripper Angle: Normalized by student's Gripper Calibration (Release vs Grab)
    const calib = window.ArmConfig ? window.ArmConfig.getGripperCalibration() : { release: 30, grab: 140, inverted: false };
    const span = Math.abs(calib.grab - calib.release) || 1;
    let normalized;
    if (calib.inverted) {
      normalized = Math.max(0, Math.min(1, (calib.release - gripperAngle) / span));
    } else {
      normalized = Math.max(0, Math.min(1, (gripperAngle - Math.min(calib.release, calib.grab)) / span));
    }
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

  drawTelemetryHUD(ctx, x, y, tipX, tipY, baseX, baseY, count) {
    ctx.save();
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#0284c7';
    ctx.fillText(`● ${count}-AXIS KINEMATICS ENGINE`, x, y);

    const relX = Math.round(tipX - baseX);
    const relY = Math.round(baseY - tipY);

    ctx.font = '11px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`TIP POS : X: ${relX > 0 ? '+' : ''}${relX}px  |  Y: +${relY}px`, x, y + 16);
    ctx.restore();
  }
}

window.RobotArmVisualizer = RobotArmVisualizer;
