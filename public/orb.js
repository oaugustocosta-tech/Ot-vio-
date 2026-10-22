// Núcleo de energia do Jarvis em 3D: uma esfera de linhas laranja entrelaçadas, raios que saem
// do centro e faíscas em volta. Quando ele fala, a esfera estufa, as linhas tremem e os raios
// se esticam no ritmo da voz; depois tudo volta ao lugar.
// No modo Ultron (setFury), tudo fica vermelho, mais rápido e instável, com espinhos que piscam.
// WebGL2 puro, sem bibliotecas. Interface: setMode(modo), setLevel(0..1) e setFury(ligado).
const VERT = `#version 300 es
in vec3 aPos;
in vec4 aSeed; // x: semente, y: posição ao longo do raio (0 centro, 1 ponta), z: tipo, w: brilho
uniform mat4 uMVP;
uniform float uTime, uBreak, uEnergy, uLift, uDpr, uFury;
out float vA;
out float vKind;
out float vT;
vec3 wobble(vec3 p, float s) {
  float tt = uTime * (1.0 + uFury * 2.5);
  return vec3(sin(p.y * 3.1 + tt * 1.3 + s * 11.0),
              sin(p.z * 2.7 + tt * 1.1 + s * 7.0),
              sin(p.x * 3.3 + tt * 0.9 + s * 5.0));
}
// Ultron: espinhos que aparecem e somem várias vezes por segundo.
float spike(float s) {
  return uFury * step(0.9, fract(sin(s * 91.7 + floor(uTime * 9.0) * 13.1) * 43758.5));
}
void main() {
  float s = aSeed.x;
  float kind = aSeed.z;
  float a = aSeed.w;
  vec3 p = aPos;
  if (kind < 0.5) {
    // Linhas da esfera: respiram, tremem e estufam com a voz.
    float r = 1.0 + 0.05 * sin(uTime * 0.8 + s * 20.0) + uBreak * 0.32 * (0.35 + s);
    p = p * r + wobble(p, s) * (0.02 + uBreak * 0.14 + uFury * 0.09);
    p += wobble(p * 4.0, s * 3.0) * uFury * 0.035 + normalize(p) * spike(s) * 0.22;
  } else if (kind < 1.5) {
    // Raios: crescem e encolhem, piscam e esticam quando ele fala.
    float len = (1.0 + 0.9 * s) * (0.55 + 0.45 * sin(uTime * (0.6 + s) * (1.0 + uFury * 3.0) + s * 30.0)) * (1.0 + uBreak * 1.1 + uFury * 0.5);
    p = aPos * aSeed.y * len;
    a *= 0.55 + 0.45 * sin(uTime * (3.0 + 6.0 * s) * (1.0 + uFury * 2.0) + s * 50.0);
  } else {
    // Faíscas em volta.
    p = p * (1.0 + uBreak * 0.6 * s + uFury * 0.25 * s) + wobble(p * 2.0, s) * (0.05 + uFury * 0.08);
    a *= 0.45 + 0.55 * sin(uTime * (1.5 + 3.0 * s) + s * 40.0);
  }
  gl_Position = uMVP * vec4(p, 1.0);
  gl_Position.y += uLift * gl_Position.w;
  gl_PointSize = (1.0 + 2.0 * s) * uDpr;
  vA = a * uEnergy;
  vKind = kind;
  vT = aSeed.y;
}`;

const FRAG = `#version 300 es
precision mediump float;
in float vA;
in float vKind;
in float vT;
uniform highp float uFury;
out vec4 o;
void main() {
  vec3 col;
  float a = vA;
  if (vKind < 0.5) {
    col = mix(vec3(1.0, 0.5, 0.1), vec3(1.0, 0.07, 0.03), uFury);
  } else if (vKind < 1.5) {
    col = mix(mix(vec3(1.0, 0.85, 0.5), vec3(1.0, 0.38, 0.05), vT), mix(vec3(1.0, 0.45, 0.35), vec3(0.9, 0.02, 0.02), vT), uFury);
    a *= 1.0 - vT * 0.7;
  } else {
    float d = length(gl_PointCoord - 0.5);
    a *= smoothstep(0.5, 0.0, d);
    col = mix(vec3(1.0, 0.72, 0.3), vec3(1.0, 0.22, 0.12), uFury);
  }
  o = vec4(col * a, 1.0);
}`;

// Brilho do núcleo, desenhado num triângulo que cobre a tela.
const CORE_VERT = `#version 300 es
const vec2 P[3] = vec2[](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }`;

const CORE_FRAG = `#version 300 es
precision mediump float;
uniform vec2 uCenter;
uniform float uRadius, uPower, uTime, uFury;
out vec4 o;
void main() {
  float d = length(gl_FragCoord.xy - uCenter) / uRadius;
  float flick = 0.93 + (0.07 + uFury * 0.18) * sin(uTime * (23.0 + uFury * 20.0)) * sin(uTime * 7.0);
  float hot = exp(-d * d * 40.0) * 1.6;
  float halo = exp(-d * 4.0) * 0.45 + exp(-d * 1.3) * (0.08 + uFury * 0.1);
  vec3 col = mix(vec3(1.0, 0.9, 0.55), vec3(1.0, 0.6, 0.5), uFury) * hot + mix(vec3(1.0, 0.42, 0.06), vec3(1.0, 0.04, 0.02), uFury) * halo;
  o = vec4(col * uPower * flick, 1.0);
}`;

const MODES = {
  off: { energy: 0.12, speed: 0.08, brk: 0, core: 0.15 },
  sleep: { energy: 0.35, speed: 0.2, brk: 0, core: 0.4 },
  idle: { energy: 0.85, speed: 0.45, brk: 0, core: 0.85 },
  listening: { energy: 1.1, speed: 0.7, brk: 0.08, core: 1.1 },
  thinking: { energy: 1.0, speed: 2.4, brk: 0.15, core: 0.95 },
  speaking: { energy: 1.15, speed: 0.7, brk: 0.04, core: 1.0 },
};

const LOOPS = 30;
const LOOP_STEPS = 140;
const RAYS = 26;
const SPARKS = 2200;

// Monta tudo num buffer só: linhas da esfera e raios (desenhados como LINES) e faíscas (POINTS).
function buildGeometry() {
  const R = Math.random;
  const pos = [];
  const seed = [];
  const randDir = () => {
    const z = R() * 2 - 1, a = R() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    return [r * Math.cos(a), r * Math.sin(a), z];
  };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };

  // Círculos em orientações aleatórias, alguns achatados ou em espiral, para parecer emaranhado.
  for (let i = 0; i < LOOPS; i++) {
    const n = randDir();
    const u = norm(cross(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
    const v = cross(n, u);
    const s = R();
    const squash = 0.75 + R() * 0.25;
    const twist = (R() - 0.5) * 0.5;
    const radius = 0.82 + R() * 0.2;
    const point = (k) => {
      const t = (k / LOOP_STEPS) * Math.PI * 2;
      const c = Math.cos(t) * radius, sn = Math.sin(t) * radius * squash;
      const lift = Math.sin(t * 2 + s * 6) * twist;
      return [0, 1, 2].map((j) => u[j] * c + v[j] * sn + n[j] * lift);
    };
    for (let k = 0; k < LOOP_STEPS; k++) {
      pos.push(...point(k), ...point(k + 1));
      seed.push(s, 0, 0, 0.5, s, 0, 0, 0.5);
    }
  }
  const lineCount = pos.length / 3;

  // Cada raio é um feixe de 3 linhas quase juntas, para ficar mais grosso e brilhante.
  for (let i = 0; i < RAYS; i++) {
    const d = randDir();
    const s = R();
    for (let j = 0; j < 3; j++) {
      const e = norm(d.map((x) => x + (R() - 0.5) * 0.012));
      pos.push(0, 0, 0, ...e);
      seed.push(s, 0, 1, 0.75, s, 1, 1, 0.75);
    }
  }
  const rayCount = pos.length / 3 - lineCount;

  for (let i = 0; i < SPARKS; i++) {
    const d = randDir();
    const r = 0.88 + Math.pow(R(), 3) * 0.4;
    pos.push(d[0] * r, d[1] * r, d[2] * r);
    seed.push(R(), 0, 2, 0.45 + R() * 0.6);
  }
  return { pos: new Float32Array(pos), seed: new Float32Array(seed), lines: lineCount + rayCount, sparks: SPARKS };
}

// --- Matrizes 4x4 (ordem de coluna, como o WebGL espera) ---------------------
const mul = (a, b) => {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
};
const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };
const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); };
const move = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

export class JarvisOrb {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = (this.gl = canvas.getContext("webgl2", { antialias: true, premultipliedAlpha: true }));
    if (!gl) throw new Error("WebGL2 indisponível");
    this.prog = this.program(VERT, FRAG);
    this.coreProg = this.program(CORE_VERT, CORE_FRAG);
    this.u = this.uniforms(this.prog, ["uMVP", "uTime", "uBreak", "uEnergy", "uLift", "uDpr", "uFury"]);
    this.uC = this.uniforms(this.coreProg, ["uCenter", "uRadius", "uPower", "uTime", "uFury"]);

    const geo = buildGeometry();
    this.lines = geo.lines;
    this.sparks = geo.sparks;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.attr("aPos", geo.pos, 3);
    this.attr("aSeed", geo.seed, 4);
    gl.bindVertexArray(null);
    this.coreVao = gl.createVertexArray();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(0, 0, 0, 0);

    this.target = MODES.idle;
    this.cur = { ...MODES.idle };
    this.level = 0;
    this.brk = 0;
    this.pulse = 0;
    this.lastLevel = 0;
    this.spinY = 0;
    this.spinX = 0;
    this.fury = 0; // 0 = Jarvis, 1 = Ultron (muda aos poucos)
    this.furyTarget = 0;
    this.surge = 0; // explosão da transformação
    this.mx = 0;
    this.my = 0;
    addEventListener("pointermove", (e) => {
      this.mx = (e.clientX / innerWidth - 0.5) * 2;
      this.my = (e.clientY / innerHeight - 0.5) * 2;
    });
    this.resize = this.resize.bind(this);
    addEventListener("resize", this.resize);
    this.resize();
    this.t0 = this.prev = performance.now();
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  program(vs, fs) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  uniforms(p, names) {
    return Object.fromEntries(names.map((n) => [n, this.gl.getUniformLocation(p, n)]));
  }

  attr(name, data, size) {
    const gl = this.gl;
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }

  resize() {
    this.dpr = Math.min(devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.round(innerWidth * this.dpr);
    this.canvas.height = Math.round(innerHeight * this.dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  setMode(m) {
    this.mode = m;
    this.target = MODES[m] || MODES.idle;
  }

  setLevel(v) {
    this.level = v;
  }

  // Liga ou desliga o Ultron, com uma explosão de energia na troca.
  setFury(on, instant = false) {
    this.furyTarget = on ? 1 : 0;
    if (instant) this.fury = this.furyTarget;
    else this.surge = 1.6;
  }

  frame(now) {
    const { gl } = this;
    const dt = Math.min(0.05, (now - this.prev) / 1000);
    this.prev = now;
    const t = (now - this.t0) / 1000;
    const k = 1 - Math.exp(-dt * 4);
    for (const key of Object.keys(this.cur)) this.cur[key] += (this.target[key] - this.cur[key]) * k;

    // A voz estufa a esfera rápido e ela volta devagar; picos dão um tranco extra.
    const lvl = this.mode === "speaking" || this.mode === "listening" ? this.level : 0;
    const want = this.cur.brk + lvl * (this.mode === "speaking" ? 1.0 : 0.3);
    this.brk += (want - this.brk) * (want > this.brk ? 1 - Math.exp(-dt * 16) : 1 - Math.exp(-dt * 3));
    if (lvl - this.lastLevel > 0.2) this.pulse = 1;
    this.lastLevel = lvl;
    this.pulse *= Math.exp(-dt * 4);
    this.fury += (this.furyTarget - this.fury) * (1 - Math.exp(-dt * 1.6));
    this.surge *= Math.exp(-dt * 1.4);
    const fast = 1 + this.fury * 1.8 + this.surge * 2;
    this.spinY += dt * this.cur.speed * 0.5 * fast;
    this.spinX += dt * this.cur.speed * 0.23 * fast;

    const w = this.canvas.width, h = this.canvas.height, aspect = w / h;
    const dist = 4.4;
    // Em tela em pé, abre o campo de visão para a esfera caber na largura.
    const fovy = aspect >= 1 ? 0.8 : 2 * Math.atan(Math.tan(0.4) / aspect);
    const proj = perspective(fovy, aspect, 0.1, 20);
    const lift = 0.07;
    const view = mul(move(0, 0, -dist), mul(rotX(this.spinX + this.my * 0.25), rotY(this.spinY + this.mx * 0.35)));
    const b = this.brk + this.pulse * 0.25 + this.surge * 0.6;

    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.coreProg);
    gl.bindVertexArray(this.coreVao);
    const pxPerUnit = h / 2 / (Math.tan(fovy / 2) * dist);
    gl.uniform2f(this.uC.uCenter, w / 2, h / 2 + lift * (h / 2));
    gl.uniform1f(this.uC.uRadius, pxPerUnit);
    gl.uniform1f(this.uC.uPower, this.cur.core * (0.85 + lvl * 0.7 + this.pulse * 0.35 + this.surge * 0.8) * (1 + this.fury * 0.2));
    gl.uniform1f(this.uC.uTime, t);
    gl.uniform1f(this.uC.uFury, this.fury);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniformMatrix4fv(this.u.uMVP, false, mul(proj, view));
    gl.uniform1f(this.u.uTime, t);
    gl.uniform1f(this.u.uBreak, b);
    gl.uniform1f(this.u.uEnergy, this.cur.energy * (1 + this.fury * 0.25 + this.surge * 0.4));
    gl.uniform1f(this.u.uFury, this.fury);
    gl.uniform1f(this.u.uLift, lift);
    gl.uniform1f(this.u.uDpr, this.dpr);
    gl.drawArrays(gl.LINES, 0, this.lines);
    gl.drawArrays(gl.POINTS, this.lines, this.sparks);
    gl.bindVertexArray(null);
    requestAnimationFrame(this.frame);
  }
}
