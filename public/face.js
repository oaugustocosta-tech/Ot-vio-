// Rosto 3D do Ultron: crânio metálico esculpido proceduralmente, mandíbula articulada,
// olhos incandescentes e pós-processamento com bloom.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const MOUTH_Y = -0.45; // altura (na esfera unitária) onde a mandíbula se separa
const JAW_THETA = Math.acos(MOUTH_Y);

const clamp01 = (x) => Math.min(1, Math.max(0, x));
function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
const gauss = (dx, dy, s) => Math.exp(-(dx * dx + dy * dy) / (2 * s * s));

// Esculpe um ponto da esfera unitária no formato do rosto.
function sculpt(v) {
  const n = v.clone().normalize();
  const { x, y, z } = n;
  const ax = Math.abs(x);
  const front = smoothstep(0.1, 0.7, z);
  let r = 1;

  // Sobrancelha em "V" — dá o ar de fúria.
  const browY = 0.19 + 0.22 * ax;
  r += 0.13 * front * Math.exp(-((y - browY) ** 2) / (2 * 0.03 ** 2)) * smoothstep(0.62, 0.08, ax);
  // Órbitas dos olhos.
  r -= 0.16 * front * gauss(ax - 0.29, y - 0.07, 0.09);
  // Maçãs do rosto angulosas.
  r += 0.09 * front * gauss(ax - 0.45, y + 0.13, 0.085);
  // Bochechas fundas.
  r -= 0.12 * front * gauss(ax - 0.33, y + 0.4, 0.1);
  // Nariz (crista estreita).
  const noseSpan = smoothstep(0.2, 0.08, y) * smoothstep(-0.3, -0.14, y);
  r += 0.11 * front * Math.exp(-(x * x) / (2 * 0.04 ** 2)) * noseSpan * (0.35 + 0.65 * smoothstep(0.12, -0.22, y));
  // Queixo marcado.
  r += 0.1 * front * gauss(x * 1.3, y + 0.8, 0.11);
  // Crista central no alto do crânio.
  r += 0.02 * Math.exp(-(x * x) / (2 * 0.05 ** 2)) * smoothstep(0.3, 0.8, y);
  // Maxilar anguloso.
  r += 0.07 * front * gauss(ax - 0.6, y + 0.52, 0.11);
  // Discos laterais ("orelhas" mecânicas).
  r += 0.05 * smoothstep(0.915, 0.935, ax);
  // Têmporas.
  r -= 0.045 * gauss(ax - 0.72, y - 0.22, 0.16) * (1 - 0.5 * front);

  let px = x * r * 0.76;
  let py = y * r * 1.06;
  let pz = z * r * 0.9;

  // Afina a parte de baixo do rosto até o queixo.
  if (y < 0.1) {
    const t = smoothstep(0.1, -1.0, y);
    px *= 1 - 0.46 * t;
    pz *= pz > 0 ? 1 - 0.04 * t : 1 - 0.35 * t;
  }
  // Crânio mais largo em cima, domo achatado: silhueta de triângulo invertido.
  px *= 1 + 0.09 * smoothstep(-0.1, 0.55, y);
  if (py > 0.45) py = 0.45 + (py - 0.45) * 0.82;
  if (pz > 0) pz *= 1 - 0.1 * smoothstep(0.3, 0.9, z); // face mais plana
  else pz *= 1.12; // nuca alongada
  v.set(px, py, pz);
}

function sculptedPart(thetaStart, thetaLength) {
  const geo = new THREE.SphereGeometry(1, 220, 160, 0, Math.PI * 2, thetaStart, thetaLength);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    sculpt(v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// --- Texturas procedurais (emendas de placas, rebites, riscos) ---------------
function makeCanvas(size = 1024) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")];
}

function scratchNoise(ctx, size, base, spread) {
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = base + (Math.random() - 0.5) * spread;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 260; i++) {
    ctx.strokeStyle = Math.random() < 0.5 ? "#000" : "#fff";
    ctx.lineWidth = Math.random() * 1.2;
    ctx.beginPath();
    const x = Math.random() * size, y = Math.random() * size;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 90, y + (Math.random() - 0.5) * 30);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// u = 0.25 é o centro da face na UV da SphereGeometry.
function craniumBump() {
  const S = 1024;
  const [c, ctx] = makeCanvas(S);
  scratchNoise(ctx, S, 128, 10);
  ctx.strokeStyle = "rgb(40,40,40)";
  ctx.lineWidth = 3;
  const vline = (u, y0, y1) => {
    ctx.beginPath();
    ctx.moveTo(u * S, y0 * S);
    ctx.lineTo(u * S, y1 * S);
    ctx.stroke();
  };
  const hline = (y, u0, u1) => {
    ctx.beginPath();
    ctx.moveTo(u0 * S, y * S);
    ctx.lineTo(u1 * S, y * S);
    ctx.stroke();
  };
  // Placas do crânio.
  for (const d of [0.075, -0.075]) vline(0.25 + d, 0, 0.42);
  for (const d of [0.19, -0.19]) vline(0.25 + d, 0.05, 1);
  vline(0.75, 0, 1);
  hline(0.46, 0.25 + 0.19, 0.25 + 0.45);
  hline(0.46, 0.75 + 0.06, 1);
  hline(0.46, 0, 0.25 - 0.19);
  // Linhas das maçãs do rosto.
  for (const s of [1, -1]) {
    ctx.beginPath();
    ctx.moveTo((0.25 + s * 0.06) * S, 0.8 * S);
    ctx.lineTo((0.25 + s * 0.15) * S, 0.72 * S);
    ctx.lineTo((0.25 + s * 0.19) * S, 0.72 * S);
    ctx.stroke();
  }
  // Rebites.
  ctx.fillStyle = "rgb(210,210,210)";
  for (const u of [0.25 + 0.21, 0.25 - 0.21, 0.73, 0.77]) {
    for (let y = 0.12; y < 0.95; y += 0.11) {
      ctx.beginPath();
      ctx.arc(u * S, y * S, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return new THREE.CanvasTexture(c);
}

function jawBump() {
  const S = 1024;
  const [c, ctx] = makeCanvas(S);
  scratchNoise(ctx, S, 128, 10);
  ctx.strokeStyle = "rgb(35,35,35)";
  ctx.lineWidth = 3;
  // Lâminas verticais da boca.
  for (let u = 0.25 - 0.1; u <= 0.25 + 0.1; u += 0.0125) {
    ctx.beginPath();
    ctx.moveTo(u * S, 0);
    ctx.lineTo(u * S, 0.3 * S);
    ctx.stroke();
  }
  for (const d of [0.12, -0.12]) {
    ctx.beginPath();
    ctx.moveTo((0.25 + d) * S, 0);
    ctx.lineTo((0.25 + d * 0.5) * S, S);
    ctx.stroke();
  }
  return new THREE.CanvasTexture(c);
}

function roughnessTex() {
  const S = 512;
  const [c, ctx] = makeCanvas(S);
  scratchNoise(ctx, S, 115, 30);
  for (let i = 0; i < 40; i++) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, "rgba(160,160,160,0.25)");
    g.addColorStop(1, "rgba(160,160,160,0)");
    ctx.save();
    ctx.translate(Math.random() * S, Math.random() * S);
    ctx.scale(20 + Math.random() * 80, 20 + Math.random() * 80);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function glowSprite(color) {
  const [c, ctx] = makeCanvas(128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, color);
  g.addColorStop(0.25, color.replace(/[\d.]+\)$/, "0.35)"));
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
}

// --- Cena ---------------------------------------------------------------------
export class UltronFace {
  constructor(canvas) {
    this.canvas = canvas;
    this.level = 0; // volume da fala 0..1
    this.mode = "idle"; // idle | listening | thinking | speaking
    this.pointer = new THREE.Vector2();
    this.timer = new THREE.Timer();
    this.nextBlink = 3;

    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x040203);
    scene.fog = new THREE.Fog(0x040203, 5, 11);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.26;

    const camera = (this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50));
    camera.position.set(0, -0.15, 6.4);

    this.buildLights();
    this.buildHead();
    this.buildEmbers();

    const composer = (this.composer = new EffectComposer(renderer));
    composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.0, 0.55, 0.9);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("pointermove", (e) => {
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    });
    renderer.setAnimationLoop(() => this.tick());
  }

  buildLights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0x3a4658, 0x1a0000, 0.35));
    const key = new THREE.DirectionalLight(0xdfe6ff, 1.1);
    key.position.set(-2.5, 3, 3);
    s.add(key);
    const fill = new THREE.DirectionalLight(0x6a7890, 0.35);
    fill.position.set(3, -1, 2);
    s.add(fill);
    for (const side of [-1, 1]) {
      const rim = new THREE.SpotLight(0xff1a0a, 22, 12, 0.5, 0.6);
      rim.position.set(side * 3, 1.5, -3);
      rim.target.position.set(0, 0, 0);
      s.add(rim, rim.target);
    }
    const under = new THREE.PointLight(0xff2200, 1.2, 4);
    under.position.set(0, -1.9, 1.4);
    s.add(under);
  }

  buildHead() {
    const head = (this.head = new THREE.Group());
    this.scene.add(head);

    const rough = roughnessTex();
    const metal = (bump) =>
      new THREE.MeshPhysicalMaterial({
        color: 0x7d828b,
        metalness: 1,
        roughness: 1,
        roughnessMap: rough,
        bumpMap: bump,
        bumpScale: 1.4,
        clearcoat: 0.35,
        clearcoatRoughness: 0.35,
        side: THREE.DoubleSide,
      });

    const cranium = new THREE.Mesh(sculptedPart(0, JAW_THETA), metal(craniumBump()));
    head.add(cranium);

    // Mandíbula articulada, com dobradiça atrás (perto das orelhas).
    const hinge = new THREE.Vector3(0, MOUTH_Y * 1.06, -0.32);
    this.jawPivot = new THREE.Group();
    this.jawPivot.position.copy(hinge);
    const jaw = new THREE.Mesh(sculptedPart(JAW_THETA, Math.PI - JAW_THETA), metal(jawBump()));
    jaw.position.copy(hinge).negate();
    this.jawPivot.add(jaw);
    head.add(this.jawPivot);

    // Núcleo incandescente dentro da cabeça — visível quando a boca abre.
    this.coreMat = new THREE.MeshStandardMaterial({ color: 0x1a0606, roughness: 0.55, metalness: 0.4, emissive: 0xff1a00, emissiveIntensity: 0.1 });
    const core = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), this.coreMat);
    core.scale.set(0.5, 0.4, 0.5);
    core.position.set(0, -0.4, 0.05);
    head.add(core);
    this.mouthGlow = new THREE.Sprite(glowSprite("rgba(255,50,10,1)"));
    this.mouthGlow.position.set(0, -0.5, 0.52);
    this.mouthGlow.scale.set(0.55, 0.3, 1);
    head.add(this.mouthGlow);
    this.mouthLight = new THREE.PointLight(0xff2a00, 0.05, 1.2);
    this.mouthLight.position.set(0, -0.48, 0.5);
    head.add(this.mouthLight);

    // Olhos: posiciona sobre a superfície esculpida via raycast frontal.
    const ray = new THREE.Raycaster();
    const eyeShape = new THREE.Shape();
    eyeShape.moveTo(-0.1, -0.01);
    eyeShape.lineTo(-0.012, 0.024);
    eyeShape.lineTo(0.115, 0.055);
    eyeShape.lineTo(0.095, 0.006);
    eyeShape.lineTo(-0.006, -0.03);
    eyeShape.closePath();
    const eyeGeo = new THREE.ShapeGeometry(eyeShape);
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.15, 0.03), toneMapped: false, side: THREE.DoubleSide });
    this.eyes = [];
    this.eyeLights = [];
    this.halos = [];
    for (const side of [1, -1]) {
      const x = side * 0.225;
      ray.set(new THREE.Vector3(x, 0.075, 5), new THREE.Vector3(0, 0, -1));
      const hit = ray.intersectObject(cranium)[0];
      const z = hit ? hit.point.z : 0.72;
      const eye = new THREE.Mesh(eyeGeo, this.eyeMat);
      eye.position.set(x, 0.07, z + 0.03);
      eye.scale.x = side;
      eye.rotation.y = side * 0.38;
      head.add(eye);
      this.eyes.push(eye);

      const halo = new THREE.Sprite(glowSprite("rgba(255,40,10,1)"));
      halo.position.set(x, 0.075, z + 0.06);
      halo.scale.setScalar(0.26);
      head.add(halo);
      this.halos.push(halo);

      const l = new THREE.PointLight(0xff2000, 0.06, 0.6);
      l.position.set(x, 0.07, z + 0.16);
      head.add(l);
      this.eyeLights.push(l);
    }

    // Pescoço: anéis e cabos.
    const neck = new THREE.Group();
    const dark = new THREE.MeshPhysicalMaterial({ color: 0x3a3d44, metalness: 1, roughness: 0.4, roughnessMap: rough });
    for (let i = 0; i < 7; i++) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.26 + i * 0.012, 0.28 + i * 0.012, 0.09, 48), i % 2 ? dark : cranium.material);
      ring.position.y = -1.0 - i * 0.12;
      neck.add(ring);
    }
    const cableMat = new THREE.MeshPhysicalMaterial({ color: 0x1b1c20, metalness: 0.6, roughness: 0.5 });
    for (const [sx, sz] of [[-0.3, 0.05], [0.3, 0.05], [-0.22, -0.2], [0.22, -0.2], [0, -0.28]]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx * 0.9, -0.6, sz),
        new THREE.Vector3(sx * 1.1, -1.2, sz + 0.04),
        new THREE.Vector3(sx * 1.25, -2.2, sz),
      ]);
      neck.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.035, 10), cableMat));
    }
    this.scene.add(neck);
    this.neck = neck;
  }

  buildEmbers() {
    const N = 450;
    const pos = new Float32Array(N * 3);
    this.emberSpeed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 6;
      pos[i * 3 + 2] = -1 - Math.random() * 5;
      this.emberSpeed[i] = 0.05 + Math.random() * 0.2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(2.5, 0.25, 0.05),
      size: 0.025,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.embers = new THREE.Points(geo, mat);
    this.scene.add(this.embers);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // Em telas estreitas (celular), afasta a câmera para caber o rosto.
    this.camera.position.z = w / h < 0.8 ? 8.6 : 6.4;
    this.camera.updateProjectionMatrix();
  }

  setMode(mode) {
    this.mode = mode;
  }

  setLevel(level) {
    this.level = level;
  }

  tick() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    const t = this.timer.getElapsed();
    const lvl = this.level;

    // Cabeça acompanha o ponteiro, com leve respiração.
    const head = this.head;
    const targetY = this.pointer.x * 0.35 + Math.sin(t * 0.3) * 0.04;
    const targetX = -this.pointer.y * 0.18 + Math.sin(t * 0.45) * 0.02 + (this.mode === "thinking" ? 0.08 : 0);
    head.rotation.y += (targetY - head.rotation.y) * dt * 2.5;
    head.rotation.x += (targetX - head.rotation.x) * dt * 2.5;
    head.rotation.z = Math.sin(t * 0.25) * 0.015 + (this.mode === "listening" ? 0.06 : 0) * Math.min(1, t);
    head.position.y = Math.sin(t * 0.8) * 0.012;
    this.neck.rotation.y = head.rotation.y * 0.3;

    // Mandíbula.
    const jawTarget = this.mode === "speaking" ? Math.min(0.17, lvl * 0.24) : 0.008;
    this.jawPivot.rotation.x += (jawTarget - this.jawPivot.rotation.x) * Math.min(1, dt * 18);

    // Brilho dos olhos conforme o estado.
    let glow = 1;
    if (this.mode === "listening") glow = 1.35 + Math.sin(t * 6) * 0.08;
    if (this.mode === "thinking") glow = 0.7 + 0.5 * (0.5 + 0.5 * Math.sin(t * 9));
    if (this.mode === "speaking") glow = 1.1 + lvl * 1.1;
    glow *= 0.94 + Math.random() * 0.06; // cintilação

    // Piscada mecânica ocasional.
    let lid = 1;
    this.nextBlink -= dt;
    if (this.nextBlink < 0) {
      const p = -this.nextBlink / 0.14;
      lid = p < 1 ? Math.abs(1 - 2 * p) : 1;
      if (p >= 1) this.nextBlink = 3 + Math.random() * 5;
    }
    for (const eye of this.eyes) eye.scale.y = Math.max(0.05, lid);
    this.eyeMat.color.setRGB(5 * glow, 0.15 * glow, 0.03 * glow);
    for (const l of this.eyeLights) l.intensity = 0.06 * glow * lid;
    for (const h of this.halos) {
      h.material.opacity = Math.min(1, 0.3 * glow) * lid;
      h.scale.setScalar(0.22 + glow * 0.04);
    }

    const core = this.mode === "speaking" ? 0.5 + lvl * 1.4 : this.mode === "thinking" ? 0.5 + 0.3 * Math.sin(t * 9) : 0.4;
    this.coreMat.emissiveIntensity = core * 0.25;
    this.mouthGlow.material.opacity = Math.min(1, core * 0.5);
    this.mouthLight.intensity = core * 0.5;
    this.bloom.strength = 0.7 + (this.mode === "speaking" ? lvl * 0.5 : 0);

    // Brasas subindo.
    const p = this.embers.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + this.emberSpeed[i] * dt;
      if (y > 3) y = -3;
      p.setY(i, y);
      p.setX(i, p.getX(i) + Math.sin(t + i) * 0.0008);
    }
    p.needsUpdate = true;

    this.composer.render(dt);
  }
}
