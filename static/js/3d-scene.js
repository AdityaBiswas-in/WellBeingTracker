/**
 * 3D Neural-Sphere Animation for Login Page
 * Uses Three.js — Black & Green digital well-being theme
 */
(function () {
  'use strict';

  const canvas  = document.getElementById('threeCanvas');
  if (!canvas || typeof THREE === 'undefined') return;

  // ── Renderer ────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.set(0, 0, 5.5);

  // ── Resize helper ────────────────────────────────────────────
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  // ── Color palette ────────────────────────────────────────────
  const GREEN_VIVID = new THREE.Color(0x00e676);
  const GREEN_MID   = new THREE.Color(0x00c853);
  const GREEN_DIM   = new THREE.Color(0x1b5e20);
  const WHITE_DIM   = new THREE.Color(0xa5d6a7);

  // ── 1. Particle Sphere ───────────────────────────────────────
  const SPHERE_PARTICLES = 900;
  const spherePositions  = new Float32Array(SPHERE_PARTICLES * 3);
  const sphereColors     = new Float32Array(SPHERE_PARTICLES * 3);
  const sphereSizes      = new Float32Array(SPHERE_PARTICLES);

  for (let i = 0; i < SPHERE_PARTICLES; i++) {
    // Fibonacci lattice on sphere surface
    const phi   = Math.acos(1 - 2 * (i + 0.5) / SPHERE_PARTICLES);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const r     = 2.2;

    spherePositions[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    spherePositions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    spherePositions[i*3+2] = r * Math.cos(phi);

    // Gradient color: top = vivid, bottom = dim
    const t   = (spherePositions[i*3+1] / r + 1) * 0.5;
    const col = GREEN_DIM.clone().lerp(GREEN_VIVID, t);
    sphereColors[i*3]   = col.r;
    sphereColors[i*3+1] = col.g;
    sphereColors[i*3+2] = col.b;

    sphereSizes[i] = 0.025 + Math.random() * 0.025;
  }

  const sphereGeo = new THREE.BufferGeometry();
  sphereGeo.setAttribute('position', new THREE.BufferAttribute(spherePositions, 3));
  sphereGeo.setAttribute('color',    new THREE.BufferAttribute(sphereColors, 3));
  sphereGeo.setAttribute('size',     new THREE.BufferAttribute(sphereSizes, 1));

  const sphereMat = new THREE.ShaderMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mvp = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (320.0 / -mvp.z);
        gl_Position  = projectionMatrix * mvp;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float alpha = smoothstep(1.0, 0.0, d);
        gl_FragColor = vec4(vColor, alpha * 0.9);
      }
    `,
  });

  const sphereMesh = new THREE.Points(sphereGeo, sphereMat);
  scene.add(sphereMesh);

  // ── 2. Connection Lines (nearby particles) ───────────────────
  const LINE_MAX  = 2200;
  const linePos   = new Float32Array(LINE_MAX * 6);
  const lineAlpha = new Float32Array(LINE_MAX);
  let   linePairs = 0;

  // Precompute pairs within threshold
  const LINK_DIST = 1.05;
  const pairs = [];
  for (let a = 0; a < SPHERE_PARTICLES; a++) {
    for (let b = a + 1; b < SPHERE_PARTICLES; b++) {
      const dx = spherePositions[a*3]   - spherePositions[b*3];
      const dy = spherePositions[a*3+1] - spherePositions[b*3+1];
      const dz = spherePositions[a*3+2] - spherePositions[b*3+2];
      const d2 = dx*dx + dy*dy + dz*dz;
      if (d2 < LINK_DIST * LINK_DIST) {
        pairs.push(a, b, Math.sqrt(d2));
        if (pairs.length / 3 >= LINE_MAX) break;
      }
    }
    if (pairs.length / 3 >= LINE_MAX) break;
  }

  linePairs = Math.min(pairs.length / 3, LINE_MAX);
  for (let i = 0; i < linePairs; i++) {
    const a = pairs[i*3], b = pairs[i*3+1], d = pairs[i*3+2];
    linePos[i*6]   = spherePositions[a*3];
    linePos[i*6+1] = spherePositions[a*3+1];
    linePos[i*6+2] = spherePositions[a*3+2];
    linePos[i*6+3] = spherePositions[b*3];
    linePos[i*6+4] = spherePositions[b*3+1];
    linePos[i*6+5] = spherePositions[b*3+2];
    lineAlpha[i]   = (1 - d / LINK_DIST) * 0.35;
  }

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos.slice(0, linePairs * 6), 3));
  const lineMat  = new THREE.LineBasicMaterial({
    color: GREEN_MID,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  const lineSegs = new THREE.LineSegments(lineGeo, lineMat);
  scene.add(lineSegs);

  // ── 3. Outer floating ring ───────────────────────────────────
  const ringGeo = new THREE.TorusGeometry(3.0, 0.012, 8, 120);
  const ringMat = new THREE.MeshBasicMaterial({ color: GREEN_DIM, transparent: true, opacity: 0.45 });
  const ring1 = new THREE.Mesh(ringGeo, ringMat);
  ring1.rotation.x = Math.PI / 3;
  scene.add(ring1);

  const ring2 = new THREE.Mesh(
    new THREE.TorusGeometry(2.7, 0.008, 8, 100),
    new THREE.MeshBasicMaterial({ color: GREEN_VIVID, transparent: true, opacity: 0.2 })
  );
  ring2.rotation.x = -Math.PI / 5;
  ring2.rotation.z = Math.PI / 6;
  scene.add(ring2);

  // ── 4. Orbiting bright nodes ─────────────────────────────────
  const ORBIT_COUNT = 6;
  const orbiters = [];
  for (let i = 0; i < ORBIT_COUNT; i++) {
    const g = new THREE.SphereGeometry(0.055, 8, 8);
    const m = new THREE.MeshBasicMaterial({ color: GREEN_VIVID });
    const mesh = new THREE.Mesh(g, m);
    const angle  = (i / ORBIT_COUNT) * Math.PI * 2;
    const radius = 2.2 + (i % 2 === 0 ? 0.6 : -0.1);
    const tilt   = (i * 0.4) - 1;
    orbiters.push({ mesh, angle, radius, tilt, speed: 0.0035 + i * 0.0012 });
    scene.add(mesh);

    // Glow halo around each orbiter
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 8, 8),
      new THREE.MeshBasicMaterial({ color: GREEN_VIVID, transparent: true, opacity: 0.12 })
    );
    mesh.add(halo);
  }

  // ── 5. Ambient light particles (dust) ───────────────────────
  const DUST = 200;
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dustPos[i*3]   = (Math.random() - 0.5) * 12;
    dustPos[i*3+1] = (Math.random() - 0.5) * 12;
    dustPos[i*3+2] = (Math.random() - 0.5) * 12;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    color: GREEN_DIM, size: 0.04, transparent: true, opacity: 0.5
  });
  scene.add(new THREE.Points(dustGeo, dustMat));

  // ── Mouse parallax ───────────────────────────────────────────
  let targetRX = 0, targetRY = 0;
  let currentRX = 0, currentRY = 0;

  document.addEventListener('mousemove', e => {
    const nx = (e.clientX / window.innerWidth)  - 0.5;
    const ny = (e.clientY / window.innerHeight) - 0.5;
    targetRY =  nx * 0.6;
    targetRX = -ny * 0.4;
  });

  // ── Animation loop ───────────────────────────────────────────
  let t = 0;
  function animate() {
    requestAnimationFrame(animate);
    resize();
    t += 0.008;

    // Smooth camera follow
    currentRX += (targetRX - currentRX) * 0.04;
    currentRY += (targetRY - currentRY) * 0.04;

    // Sphere slow rotation
    sphereMesh.rotation.y = t * 0.18;
    sphereMesh.rotation.x = Math.sin(t * 0.09) * 0.15 + currentRX;
    sphereMesh.rotation.z = currentRY * 0.5;

    // Lines follow sphere
    lineSegs.rotation.copy(sphereMesh.rotation);

    // Rings counter-rotate
    ring1.rotation.z = t * 0.12;
    ring2.rotation.y = t * 0.09;
    ring1.rotation.x = Math.PI / 3 + currentRX * 0.3;
    ring2.rotation.z = Math.PI / 6 + currentRY * 0.3;

    // Orbiters
    orbiters.forEach(o => {
      o.angle += o.speed;
      o.mesh.position.set(
        Math.cos(o.angle) * o.radius,
        o.tilt + Math.sin(o.angle * 1.3) * 0.5,
        Math.sin(o.angle) * o.radius
      );
    });

    // Pulsing line opacity
    lineMat.opacity = 0.13 + Math.sin(t * 1.2) * 0.06;

    renderer.render(scene, camera);
  }
  animate();
})();
