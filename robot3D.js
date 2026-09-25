/**
 * 3D Robot Arm Kinematics Simulator (Three.js + OrbitControls)
 * High-Tech Industrial Robotic Arm Edition
 * Features:
 * - Studio Lighting (Bright, clear, crisp shadows, neon accents)
 * - Industrial-grade articulated robotic joints with bearing hubs and LED status rings
 * - Aerodynamic sculpted limbs with dual chrome support struts and carbon insets
 * - Precision dual-finger mechanical gripper with textured rubber pads & illuminated tips
 * - Smooth 60FPS Forward Kinematics (2, 3, 4, 5, 6 Servos)
 * - OrbitControls (360° Rotate, Zoom, Pan)
 */

class RobotArm3D {
  constructor(containerId, servoCount = 4) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`Container "${containerId}" not found for 3D visualizer.`);
      return;
    }

    this.servoCount = servoCount || (window.ArmConfig ? window.ArmConfig.getCurrentServoCount() : 4);
    
    // Angles state
    const defaultAngles = window.ArmConfig ? window.ArmConfig.getDefaultAngles(this.servoCount) : { base: 90, shoulder: 90, elbow: 90, gripper: 90 };
    this.target = { ...defaultAngles };
    this.current = { ...defaultAngles };

    this.isRunning = false;

    this.initThree();
    this.buildScene();
    this.initMaterials();
    this.buildRobot();
    this.startAnimation();

    window.addEventListener('resize', () => this.onResize());
    setTimeout(() => this.onResize(), 80);
  }

  initThree() {
    // 1. Scene - Bright high-tech studio environment
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e1726); // Clean deep navy studio background

    // 2. Camera
    const rect = this.container.getBoundingClientRect();
    const width = rect.width || 600;
    const height = Math.max(400, rect.height || 580);

    this.camera = new THREE.PerspectiveCamera(40, width / height, 1, 2500);
    this.camera.position.set(190, 160, 240);

    // 3. Renderer with high-quality antialiasing and tone mapping
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25; // Brighter exposure

    // Mount
    this.container.innerHTML = '';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.outline = 'none';
    this.container.appendChild(this.renderer.domElement);

    // 4. OrbitControls
    if (THREE.OrbitControls) {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.06;
      this.controls.maxPolarAngle = Math.PI / 2 - 0.03; // Don't go under floor
      this.controls.minDistance = 80;
      this.controls.maxDistance = 750;
      this.controls.target.set(0, 75, 0);
      this.controls.update();
    }
  }

  buildScene() {
    // 1. Hemisphere Light (Soft sky to ground gradient for natural illumination)
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e293b, 1.8);
    hemiLight.position.set(0, 300, 0);
    this.scene.add(hemiLight);

    // 2. Ambient Light (Boost overall baseline visibility)
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 1.0);
    this.scene.add(ambientLight);

    // 3. Key Studio Light (Bright directional with soft shadow)
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(160, 280, 180);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 800;
    const d = 160;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);

    // 4. Front-Left Studio Fill Light (Cool sky blue)
    const fillLight = new THREE.DirectionalLight(0x38bdf8, 1.4);
    fillLight.position.set(-180, 160, 100);
    this.scene.add(fillLight);

    // 5. Back Rim Light (Vibrant cyan edge highlights)
    const rimLight = new THREE.PointLight(0x00f0ff, 2.0, 500);
    rimLight.position.set(-60, 180, -180);
    this.scene.add(rimLight);

    // 6. Base Spotlight for High-Tech Glow
    const spotLight = new THREE.SpotLight(0x00f0ff, 1.8, 300, Math.PI / 4, 0.4);
    spotLight.position.set(0, 180, 0);
    spotLight.target.position.set(0, 0, 0);
    this.scene.add(spotLight);
    this.scene.add(spotLight.target);

    // 7. Ground Grid Floor
    const grid = new THREE.GridHelper(360, 36, 0x00f0ff, 0x1e3a5f);
    grid.position.y = 0.1;
    this.scene.add(grid);

    // 8. Ground Circular Platform with Shadows
    const floorGeo = new THREE.CircleGeometry(220, 64);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0a101d,
      roughness: 0.6,
      metalness: 0.4
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // 9. Cyberpunk Glow Rings on Ground
    const glowRingGeo = new THREE.RingGeometry(52, 54, 64);
    const glowRingMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide });
    const glowRing = new THREE.Mesh(glowRingGeo, glowRingMat);
    glowRing.rotation.x = -Math.PI / 2;
    glowRing.position.y = 0.2;
    this.scene.add(glowRing);

    const outerRingGeo = new THREE.RingGeometry(85, 86, 64);
    const outerRingMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, side: THREE.DoubleSide, opacity: 0.5, transparent: true });
    const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.2;
    this.scene.add(outerRing);
  }

  initMaterials() {
    // High-tech PBR Materials with realistic metallic reflection & sheen
    this.mats = {
      // Main Body Chassis (Industrial Matte White / Silver Titanium)
      bodyWhite: new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        roughness: 0.25,
        metalness: 0.35
      }),
      // Body Accent Grey
      bodyDark: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.4,
        metalness: 0.7
      }),
      // Carbon Fiber Inset Plate
      carbon: new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.7,
        metalness: 0.2
      }),
      // Polished Chrome / Steel Joint Hubs & Struts
      chrome: new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.15,
        metalness: 0.95
      }),
      // Brass / Gold Hardware Accents
      gold: new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        roughness: 0.3,
        metalness: 0.8
      }),
      // Vibrant Color Accents for Joints
      baseBlue: new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        roughness: 0.25,
        metalness: 0.5
      }),
      shoulderPurple: new THREE.MeshStandardMaterial({
        color: 0x6366f1,
        roughness: 0.25,
        metalness: 0.6
      }),
      elbowCyan: new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        roughness: 0.25,
        metalness: 0.6
      }),
      wristAmber: new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        roughness: 0.25,
        metalness: 0.6
      }),
      wristRollRose: new THREE.MeshStandardMaterial({
        color: 0xf43f5e,
        roughness: 0.25,
        metalness: 0.6
      }),
      gripperGreen: new THREE.MeshStandardMaterial({
        color: 0x10b981,
        roughness: 0.3,
        metalness: 0.4
      }),
      // Gripper Silicone Grip Pads
      rubberGrip: new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.9,
        metalness: 0.05
      }),
      // Glowing Neon LED Strips & Indicators
      ledCyan: new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x00f0ff,
        emissiveIntensity: 1.2,
        roughness: 0.1
      }),
      ledEmerald: new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        emissive: 0x22c55e,
        emissiveIntensity: 1.0,
        roughness: 0.1
      }),
      ledOrange: new THREE.MeshStandardMaterial({
        color: 0xf97316,
        emissive: 0xf97316,
        emissiveIntensity: 0.8,
        roughness: 0.1
      })
    };
  }

  buildRobot() {
    if (this.robotRoot) {
      this.scene.remove(this.robotRoot);
    }

    this.robotRoot = new THREE.Group();
    this.scene.add(this.robotRoot);

    const m = this.mats;

    // ========================================================
    // 1. STATIONARY HEAVY-DUTY BASE PLINTH (ฐานตั้งโต๊ะ)
    // ========================================================
    const baseAssembly = new THREE.Group();
    
    // Bottom flange plate with chamfer
    const footGeo = new THREE.CylinderGeometry(48, 54, 8, 36);
    const foot = new THREE.Mesh(footGeo, m.bodyDark);
    foot.position.y = 4;
    foot.castShadow = true;
    foot.receiveShadow = true;
    baseAssembly.add(foot);

    // Beveled mounting bolts around foot
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 2, 12), m.chrome);
      bolt.position.set(Math.cos(angle) * 44, 8.5, Math.sin(angle) * 44);
      baseAssembly.add(bolt);
    }

    // Glowing LED Ring between stationary foot and rotating turret
    const baseLedRing = new THREE.Mesh(new THREE.TorusGeometry(40, 1.2, 16, 48), m.ledCyan);
    baseLedRing.rotation.x = Math.PI / 2;
    baseLedRing.position.y = 8;
    baseAssembly.add(baseLedRing);

    this.robotRoot.add(baseAssembly);

    // ========================================================
    // 2. ROTATING TURRET (แกนหมุนฐาน - Base Rotation / Servo 1)
    // ========================================================
    this.baseGroup = new THREE.Group();
    this.baseGroup.position.set(0, 8, 0);
    this.robotRoot.add(this.baseGroup);

    // Sleek chamfered motor turret
    const turretGeo = new THREE.CylinderGeometry(34, 38, 22, 36);
    const turret = new THREE.Mesh(turretGeo, m.bodyWhite);
    turret.position.y = 11;
    turret.castShadow = true;
    this.baseGroup.add(turret);

    // Blue anodized decorative band
    const bandGeo = new THREE.CylinderGeometry(34.2, 34.2, 6, 36);
    const band = new THREE.Mesh(bandGeo, m.baseBlue);
    band.position.y = 11;
    this.baseGroup.add(band);

    // High-Tech Dual Yoke Brackets (เสาค้ำไหล่คู่ซ้าย-ขวา)
    const yokeWidth = 8;
    const yokeHeight = 36;
    const yokeDepth = 26;
    const yokeGeo = new THREE.BoxGeometry(yokeWidth, yokeHeight, yokeDepth);

    // Left yoke
    const yokeLeft = new THREE.Mesh(yokeGeo, m.bodyDark);
    yokeLeft.position.set(-18, 30, 0);
    yokeLeft.castShadow = true;
    this.baseGroup.add(yokeLeft);

    // Right yoke
    const yokeRight = new THREE.Mesh(yokeGeo, m.bodyDark);
    yokeRight.position.set(18, 30, 0);
    yokeRight.castShadow = true;
    this.baseGroup.add(yokeRight);

    // Outer Chrome Servo Housing Caps on Yoke
    const capGeo = new THREE.CylinderGeometry(11, 11, 3, 24);
    const capL = new THREE.Mesh(capGeo, m.chrome);
    capL.rotation.z = Math.PI / 2;
    capL.position.set(-23, 40, 0);
    this.baseGroup.add(capL);

    const capR = new THREE.Mesh(capGeo, m.chrome);
    capR.rotation.z = Math.PI / 2;
    capR.position.set(23, 40, 0);
    this.baseGroup.add(capR);

    // ========================================================
    // 3. SHOULDER JOINT PIVOT (จุดหมุนหัวไหล่ / Servo 2)
    // ========================================================
    this.shoulderJoint = new THREE.Group();
    this.shoulderJoint.position.set(0, 40, 0);
    this.baseGroup.add(this.shoulderJoint);

    // Main central bearing cylinder
    const shoulderHub = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 34, 28), m.shoulderPurple);
    shoulderHub.rotation.z = Math.PI / 2;
    shoulderHub.castShadow = true;
    this.shoulderJoint.add(shoulderHub);

    // Glowing Joint LED Core
    const sLed = new THREE.Mesh(new THREE.SphereGeometry(3.5, 16, 16), m.ledCyan);
    sLed.position.set(0, 0, 10);
    this.shoulderJoint.add(sLed);

    // สร้างข้อต่อตามจำนวน Servo (2, 3, 4, 5, 6)
    const count = this.servoCount;

    if (count === 2) {
      // 2 Servos: Base + Gripper (Rotates and clamps right on mount)
      const armLength = 50;
      const link1 = this.createSculptedArmLink(armLength, m.baseBlue, m.bodyWhite, 16);
      this.shoulderJoint.add(link1);

      this.wristGroup = new THREE.Group();
      this.wristGroup.position.set(0, armLength, 0);
      this.shoulderJoint.add(this.wristGroup);

      this.buildIndustrialGripper(this.wristGroup);

    } else if (count === 3) {
      // 3 Servos: Base + Main Arm + Gripper
      const armLength = 95;
      const link1 = this.createSculptedArmLink(armLength, m.shoulderPurple, m.bodyWhite, 18);
      this.shoulderJoint.add(link1);

      this.wristGroup = new THREE.Group();
      this.wristGroup.position.set(0, armLength, 0);
      this.shoulderJoint.add(this.wristGroup);

      this.buildIndustrialGripper(this.wristGroup);

    } else if (count === 4) {
      // 4 Servos: Base + Shoulder + Elbow + Gripper (Standard Industrial)
      const upperLength = 75;
      const foreLength = 65;

      // Link 1: Upper Arm
      const link1 = this.createSculptedArmLink(upperLength, m.shoulderPurple, m.bodyWhite, 18);
      this.shoulderJoint.add(link1);

      // Elbow Joint Assembly
      this.elbowJoint = new THREE.Group();
      this.elbowJoint.position.set(0, upperLength, 0);
      this.shoulderJoint.add(this.elbowJoint);

      this.createJointHub(this.elbowJoint, m.elbowCyan, 9, 30);

      // Link 2: Forearm
      const link2 = this.createSculptedArmLink(foreLength, m.elbowCyan, m.bodyWhite, 15);
      this.elbowJoint.add(link2);

      // End Effector Wrist Mount
      this.wristGroup = new THREE.Group();
      this.wristGroup.position.set(0, foreLength, 0);
      this.elbowJoint.add(this.wristGroup);

      this.buildIndustrialGripper(this.wristGroup);

    } else if (count === 5) {
      // 5 Servos: Base + Shoulder + Elbow + WristPitch + Gripper
      const upperLength = 70;
      const foreLength = 58;
      const wristLength = 30;

      const link1 = this.createSculptedArmLink(upperLength, m.shoulderPurple, m.bodyWhite, 18);
      this.shoulderJoint.add(link1);

      // Elbow
      this.elbowJoint = new THREE.Group();
      this.elbowJoint.position.set(0, upperLength, 0);
      this.shoulderJoint.add(this.elbowJoint);
      this.createJointHub(this.elbowJoint, m.elbowCyan, 9, 30);

      const link2 = this.createSculptedArmLink(foreLength, m.elbowCyan, m.bodyWhite, 15);
      this.elbowJoint.add(link2);

      // Wrist Pitch Joint
      this.wristPitchJoint = new THREE.Group();
      this.wristPitchJoint.position.set(0, foreLength, 0);
      this.elbowJoint.add(this.wristPitchJoint);
      this.createJointHub(this.wristPitchJoint, m.wristAmber, 7, 24);

      const link3 = this.createSculptedArmLink(wristLength, m.wristAmber, m.bodyDark, 12);
      this.wristPitchJoint.add(link3);

      this.wristGroup = new THREE.Group();
      this.wristGroup.position.set(0, wristLength, 0);
      this.wristPitchJoint.add(this.wristGroup);

      this.buildIndustrialGripper(this.wristGroup);

    } else if (count === 6) {
      // 6 Servos: Base + Shoulder + Elbow + WristPitch + WristRoll + Gripper (Full 6-DOF)
      const upperLength = 70;
      const foreLength = 56;
      const wristLength = 26;

      const link1 = this.createSculptedArmLink(upperLength, m.shoulderPurple, m.bodyWhite, 18);
      this.shoulderJoint.add(link1);

      // Elbow
      this.elbowJoint = new THREE.Group();
      this.elbowJoint.position.set(0, upperLength, 0);
      this.shoulderJoint.add(this.elbowJoint);
      this.createJointHub(this.elbowJoint, m.elbowCyan, 9, 30);

      const link2 = this.createSculptedArmLink(foreLength, m.elbowCyan, m.bodyWhite, 15);
      this.elbowJoint.add(link2);

      // Wrist Pitch
      this.wristPitchJoint = new THREE.Group();
      this.wristPitchJoint.position.set(0, foreLength, 0);
      this.elbowJoint.add(this.wristPitchJoint);
      this.createJointHub(this.wristPitchJoint, m.wristAmber, 7, 24);

      const link3 = this.createSculptedArmLink(wristLength, m.wristAmber, m.bodyDark, 12);
      this.wristPitchJoint.add(link3);

      // Wrist Roll (หมุนรอบแกน Y ของมือ)
      this.wristRollJoint = new THREE.Group();
      this.wristRollJoint.position.set(0, wristLength, 0);
      this.wristPitchJoint.add(this.wristRollJoint);

      // Industrial Roll Bearing Collar with Pink/Rose indicator ring
      const rollCollarGeo = new THREE.CylinderGeometry(9, 9, 10, 24);
      const rollCollar = new THREE.Mesh(rollCollarGeo, m.bodyDark);
      rollCollar.position.y = 5;
      rollCollar.castShadow = true;
      this.wristRollJoint.add(rollCollar);

      const rollRing = new THREE.Mesh(new THREE.TorusGeometry(9.2, 1, 16, 32), m.wristRollRose);
      rollRing.rotation.x = Math.PI / 2;
      rollRing.position.y = 5;
      this.wristRollJoint.add(rollRing);

      this.wristGroup = new THREE.Group();
      this.wristGroup.position.set(0, 10, 0);
      this.wristRollJoint.add(this.wristGroup);

      this.buildIndustrialGripper(this.wristGroup);
    }
  }

  /**
   * Helper สร้างข้อต่อ Joint Hub พร้อมไฟ LED และฝาครอบโครเมียม
   */
  createJointHub(parentGroup, accentMat, radius = 8, width = 28) {
    const m = this.mats;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 24), accentMat);
    hub.rotation.z = Math.PI / 2;
    hub.castShadow = true;
    parentGroup.add(hub);

    // End Caps (Chrome)
    const capGeo = new THREE.CylinderGeometry(radius * 0.9, radius * 0.9, 1.5, 20);
    const cap1 = new THREE.Mesh(capGeo, m.chrome);
    cap1.rotation.z = Math.PI / 2;
    cap1.position.x = -width / 2 - 0.5;
    parentGroup.add(cap1);

    const cap2 = new THREE.Mesh(capGeo, m.chrome);
    cap2.rotation.z = Math.PI / 2;
    cap2.position.x = width / 2 + 0.5;
    parentGroup.add(cap2);

    // Center LED indicator
    const led = new THREE.Mesh(new THREE.SphereGeometry(2.5, 12, 12), m.ledCyan);
    led.position.set(0, 0, radius);
    parentGroup.add(led);
  }

  /**
   * Helper สร้างท่อนกระดูกแขนกลแบบดีไซน์อุตสาหกรรม (Sculpted Industrial Arm Link)
   * มีแกนโครเมียมคู่ขนาน แผ่นคาร์บอนไฟเบอร์ และเคสไททาเนียม
   */
  createSculptedArmLink(length, accentMat, mainMat, width = 16) {
    const group = new THREE.Group();
    const m = this.mats;

    // 1. Central Aerodynamic Structural Spine
    const spineWidth = width * 0.85;
    const spineDepth = width * 0.7;
    const spineGeo = new THREE.BoxGeometry(spineWidth, length - 12, spineDepth);
    const spine = new THREE.Mesh(spineGeo, mainMat);
    spine.position.y = length / 2;
    spine.castShadow = true;
    group.add(spine);

    // 2. Contrasting Carbon Fiber Recessed Inset Panel
    const insetGeo = new THREE.BoxGeometry(spineWidth * 0.6, length * 0.6, spineDepth + 1);
    const inset = new THREE.Mesh(insetGeo, m.carbon);
    inset.position.y = length / 2;
    group.add(inset);

    // 3. Dual Polished Chrome Support Hydraulic Struts (แกนสแตนเลสคู่ขนาน)
    const strutRadius = 1.6;
    const strutGeo = new THREE.CylinderGeometry(strutRadius, strutRadius, length - 10, 16);
    
    const strutLeft = new THREE.Mesh(strutGeo, m.chrome);
    strutLeft.position.set(-width * 0.55, length / 2, 0);
    strutLeft.castShadow = true;
    group.add(strutLeft);

    const strutRight = new THREE.Mesh(strutGeo, m.chrome);
    strutRight.position.set(width * 0.55, length / 2, 0);
    strutRight.castShadow = true;
    group.add(strutRight);

    // 4. Accent Color Mounting Brackets (top & bottom clamps)
    const clampGeo = new THREE.BoxGeometry(width + 4, 6, width * 0.75);
    const clampBottom = new THREE.Mesh(clampGeo, accentMat);
    clampBottom.position.y = 8;
    clampBottom.castShadow = true;
    group.add(clampBottom);

    const clampTop = new THREE.Mesh(clampGeo, accentMat);
    clampTop.position.y = length - 8;
    clampTop.castShadow = true;
    group.add(clampTop);

    // 5. LED Glowing Stripe along arm
    const stripeGeo = new THREE.BoxGeometry(1.5, length * 0.5, spineDepth + 1.2);
    const stripe = new THREE.Mesh(stripeGeo, m.ledCyan);
    stripe.position.y = length / 2;
    group.add(stripe);

    return group;
  }

  /**
   * สร้างชุดก้ามปูคีบระดับอุตสาหกรรม (Industrial Precision Parallel Gripper)
   */
  buildIndustrialGripper(parentGroup) {
    const m = this.mats;

    // 1. Tool Flange Adapter (มาตรฐาน ISO Robot Flange)
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 5, 24), m.chrome);
    flange.position.y = 2.5;
    flange.castShadow = true;
    parentGroup.add(flange);

    // Flange mounting bolts
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1, 8), m.gold);
      screw.position.set(Math.cos(angle) * 8.5, 5.2, Math.sin(angle) * 8.5);
      parentGroup.add(screw);
    }

    // 2. Gripper Actuator Body (กล่องมอเตอร์ก้ามปูทรงเหลี่ยมตัดมน)
    const palmGeo = new THREE.BoxGeometry(26, 12, 16);
    const palm = new THREE.Mesh(palmGeo, m.bodyDark);
    palm.position.y = 11;
    palm.castShadow = true;
    parentGroup.add(palm);

    // Status LED indicator on Gripper head
    const gripLed = new THREE.Mesh(new THREE.SphereGeometry(2, 12, 12), m.ledEmerald);
    gripLed.position.set(0, 11, 8.5);
    parentGroup.add(gripLed);

    // Linear guide rails for claws
    const railGeo = new THREE.CylinderGeometry(1.5, 1.5, 22, 12);
    const rail = new THREE.Mesh(railGeo, m.chrome);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, 15, 0);
    parentGroup.add(rail);

    // 3. นิ้วก้ามปูด้านซ้าย (Left Finger)
    this.clawLeft = new THREE.Group();
    this.clawLeft.position.set(-7, 17, 0);
    parentGroup.add(this.clawLeft);

    // Mechanical Claw Arm 1
    const fingerShape1 = new THREE.Group();
    const fMain1 = new THREE.Mesh(new THREE.BoxGeometry(4, 24, 8), m.gripperGreen);
    fMain1.position.set(-2, 12, 0);
    fMain1.rotation.z = -0.12;
    fMain1.castShadow = true;
    fingerShape1.add(fMain1);

    // Textured Rubber Contact Pad (ยางกันลื่นสีดำด้านในก้ามปู)
    const pad1 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 18, 7), m.rubberGrip);
    pad1.position.set(0.5, 12, 0);
    fingerShape1.add(pad1);

    // Claw Tip (Glowing illuminated claw tip)
    const tip1 = new THREE.Mesh(new THREE.ConeGeometry(3, 8, 4), m.ledEmerald);
    tip1.position.set(-0.5, 24, 0);
    tip1.rotation.z = Math.PI;
    fingerShape1.add(tip1);

    this.clawLeft.add(fingerShape1);

    // 4. นิ้วก้ามปูด้านขวา (Right Finger)
    this.clawRight = new THREE.Group();
    this.clawRight.position.set(7, 17, 0);
    parentGroup.add(this.clawRight);

    // Mechanical Claw Arm 2
    const fingerShape2 = new THREE.Group();
    const fMain2 = new THREE.Mesh(new THREE.BoxGeometry(4, 24, 8), m.gripperGreen);
    fMain2.position.set(2, 12, 0);
    fMain2.rotation.z = 0.12;
    fMain2.castShadow = true;
    fingerShape2.add(fMain2);

    // Textured Rubber Contact Pad
    const pad2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 18, 7), m.rubberGrip);
    pad2.position.set(-0.5, 12, 0);
    fingerShape2.add(pad2);

    // Claw Tip
    const tip2 = new THREE.Mesh(new THREE.ConeGeometry(3, 8, 4), m.ledEmerald);
    tip2.position.set(0.5, 24, 0);
    tip2.rotation.z = Math.PI;
    fingerShape2.add(tip2);

    this.clawRight.add(fingerShape2);
  }

  setServoCount(count) {
    const n = parseInt(count, 10);
    if ([2, 3, 4, 5, 6].includes(n)) {
      this.servoCount = n;
      this.buildRobot();
      const defaultAngles = window.ArmConfig ? window.ArmConfig.getDefaultAngles(n) : {};
      for (const k in defaultAngles) {
        if (this.target[k] === undefined) this.target[k] = defaultAngles[k];
        if (this.current[k] === undefined) this.current[k] = defaultAngles[k];
      }
    }
  }

  setAngles(...args) {
    if (args.length === 0) return;
    if (typeof args[0] === 'object' && args[0] !== null) {
      for (const k in args[0]) {
        if (args[0][k] !== undefined) {
          this.target[k] = Number(args[0][k]);
          if (this.current[k] === undefined) this.current[k] = this.target[k];
        }
      }
    } else {
      const cfg = window.ArmConfig ? window.ArmConfig.getServoConfig(this.servoCount) : null;
      if (cfg && cfg.axes) {
        cfg.axes.forEach((axis, i) => {
          if (args[i] !== undefined) {
            this.target[axis.key] = Number(args[i]);
            if (this.current[axis.key] === undefined) this.current[axis.key] = this.target[axis.key];
          }
        });
      }
    }
  }

  startAnimation() {
    if (this.isRunning) return;
    this.isRunning = true;
    const animate = () => {
      this.updateKinematics();
      if (this.controls) this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  updateKinematics() {
    // Responsive Smooth Kinematics (Zero-lag 60fps tracking)
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

    const degToRad = Math.PI / 180;

    // 1. หมุนฐาน Base (รอบแกน Y)
    // 90 องศาคือตรงกลาง, 0 องศาซ้าย (-90 deg), 180 องศาขวา (+90 deg)
    const baseVal = this.current.base !== undefined ? this.current.base : 90;
    if (this.baseGroup) {
      this.baseGroup.rotation.y = -(baseVal - 90) * degToRad;
    }

    // 2. หมุนหัวไหล่ Shoulder (รอบแกน X)
    // 90 องศาคือตั้งตรง 0, 0 องศาก้มไปข้างหน้า (-90 deg), 180 องศาเงยไปข้างหลัง (+90 deg)
    const shoulderVal = this.current.shoulder !== undefined ? this.current.shoulder : 90;
    if (this.shoulderJoint) {
      this.shoulderJoint.rotation.x = (shoulderVal - 90) * degToRad;
    }

    // 3. หมุนข้อศอก Elbow (รอบแกน X)
    const elbowVal = this.current.elbow !== undefined ? this.current.elbow : 90;
    if (this.elbowJoint) {
      this.elbowJoint.rotation.x = (elbowVal - 90) * degToRad;
    }

    // 4. หมุนข้อมือก้มเงย Wrist Pitch (รอบแกน X)
    const wristPitchVal = this.current.wristPitch !== undefined ? this.current.wristPitch : 90;
    if (this.wristPitchJoint) {
      this.wristPitchJoint.rotation.x = (wristPitchVal - 90) * degToRad;
    }

    // 5. หมุนข้อมือ Wrist Roll (รอบแกน Y)
    const wristRollVal = this.current.wristRoll !== undefined ? this.current.wristRoll : 90;
    if (this.wristRollJoint) {
      this.wristRollJoint.rotation.y = (wristRollVal - 90) * degToRad;
    }

    // 6. อ้า/หุบก้ามปู Gripper (Symmetrical Parallel + Angular Gripper Motion)
    const gripperVal = this.current.gripper !== undefined ? this.current.gripper : 90;
    const calib = window.ArmConfig ? window.ArmConfig.getGripperCalibration() : { release: 30, grab: 140, inverted: false };
    const span = Math.abs(calib.grab - calib.release) || 1;
    let normalized;
    if (calib.inverted) {
      normalized = Math.max(0, Math.min(1, (calib.release - gripperVal) / span));
    } else {
      normalized = Math.max(0, Math.min(1, (gripperVal - Math.min(calib.release, calib.grab)) / span));
    }
    
    // ระยะเลื่อนแกน X ของนิ้ว (Linear motion)
    const slideOffset = (1 - normalized) * 4.5;
    // มุมเอียงนิ้ว (Angular motion)
    const clawAngle = (1 - normalized) * 0.32 - 0.04;

    if (this.clawLeft) {
      this.clawLeft.position.x = -6 - slideOffset;
      this.clawLeft.rotation.z = -clawAngle;
    }
    if (this.clawRight) {
      this.clawRight.position.x = 6 + slideOffset;
      this.clawRight.rotation.z = clawAngle;
    }
  }

  resetCamera() {
    if (this.controls) {
      this.camera.position.set(190, 160, 240);
      this.controls.target.set(0, 75, 0);
      this.controls.update();
    }
  }

  onResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const rect = this.container.getBoundingClientRect();
    const width = rect.width || 600;
    const height = Math.max(400, rect.height || 580);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}

window.RobotArm3D = RobotArm3D;
