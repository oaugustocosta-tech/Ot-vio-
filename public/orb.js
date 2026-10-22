// Núcleo do Jarvis no estilo holograma do Jarvis: reator laranja e dourado com anéis
// segmentados girando, fragmentos de dados, filamentos de energia e um núcleo que pulsa com a voz.
// WebGL puro, sem dependências. Interface: new JarvisOrb(canvas), setMode(estado), setLevel(0..1).

const VERT = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uLevel;   // volume da fala, suavizado
uniform float uFlow;    // rotação acumulada (mais rápida quando pensa)
uniform float uEnergy;  // brilho geral do estado
uniform float uRing;    // pulso de "ouvindo"
out vec4 outColor;

const float PI = 3.14159265;
const vec3 EMBER = vec3(0.55, 0.16, 0.02);
const vec3 AMBER = vec3(1.0, 0.48, 0.08);
const vec3 GOLD  = vec3(1.0, 0.74, 0.32);
const vec3 HOT   = vec3(1.0, 0.93, 0.78);

float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.1 + 3.7; a *= 0.5; }
  return v;
}
float band(float x, float c, float w) { return exp(-pow((x - c) / w, 2.0)); }

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y) - vec2(0.0, 0.05);
  float R = 0.2 * (1.0 + 0.07 * uLevel);
  float r = length(p) / R;
  float ang = atan(p.y, p.x);
  float u = ang / (2.0 * PI) + 0.5;
  float t = uTime;
  vec3 col = vec3(0.0);

  // Disco de fundo, bem fraco, como a lente do holograma.
  col += EMBER * 0.08 * smoothstep(1.5, 1.44, r) * smoothstep(0.3, 1.45, r);

  // Anel externo fino com marcações de régua.
  col += GOLD * 0.55 * band(r, 1.42, 0.006);
  float tick = step(fract(u * 180.0 + uFlow * 0.02), 0.22) * step(1.30, r) * step(r, 1.36);
  float bigTick = step(fract(u * 36.0 + uFlow * 0.02), 0.06) * step(1.27, r) * step(r, 1.38);
  col += AMBER * (tick * 0.35 + bigTick * 0.6);

  // Varredura: um feixe que gira pelos anéis.
  float sweep = fract(u - uFlow * 0.06);
  col += AMBER * exp(-sweep * 30.0) * 0.18 * band(r, 1.0, 0.3);

  // Anéis segmentados girando em sentidos alternados.
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float ri = 0.5 + 0.17 * fi;
    float dir = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
    float n = 18.0 + fi * 14.0;
    float x = (u + dir * uFlow * (0.03 + 0.012 * fi)) * n;
    float seg = floor(x);
    float f = fract(x);
    float on = step(0.45, hash(seg + fi * 31.0));
    float duty = 0.35 + 0.55 * hash(seg + fi * 17.0);
    float w = 0.004 + 0.012 * hash(seg + fi * 5.0);
    float wob = 0.025 * sin(seg * 1.7 + t * 1.3) + 0.06 * uLevel * sin(seg * 3.1 + t * 9.0);
    float m = band(r, ri + wob, w) * step(f, duty) * on;
    col += mix(AMBER, HOT, 0.6 * hash(seg + fi * 3.0)) * m * (0.9 + 1.2 * uLevel) * (0.75 + 0.35 * uRing);
  }

  // Fragmentos de dados: traços curtos tangenciais, mais densos perto da borda da esfera.
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    vec2 g = vec2((u + uFlow * (0.01 + 0.02 * fk)) * (160.0 + 90.0 * fk), r * (26.0 + 10.0 * fk));
    vec2 cell = floor(g);
    vec2 fr = fract(g);
    float h = hash2(cell + fk * 9.0);
    float alive = step(0.82 - 0.12 * uLevel, h);
    float len = 0.3 + 0.6 * hash2(cell + 4.0);
    float dash = step(fr.x, len) * band(fr.y, 0.5, 0.12);
    float shell = smoothstep(0.55, 0.95, r) * smoothstep(1.32, 1.02, r);
    float flick = 0.5 + 0.5 * sin(t * (2.0 + 6.0 * h) + h * 50.0);
    col += mix(AMBER, HOT, h * h) * alive * dash * shell * flick * 1.6;
  }

  // Plasma: textura de fogo na casca do reator.
  float plasma = fbm(vec2(ang * 2.5 + uFlow * 0.08, r * 4.0 - t * 0.5));
  col += mix(EMBER, AMBER, plasma) * pow(plasma, 3.0) * 1.6 * band(r, 0.95, 0.28) * (0.8 + uLevel);

  // Esfera em malha (latitude e longitude) girando lentamente dentro do reator.
  if (r < 1.0) {
    vec2 q = p / (R * 1.0);
    float z = sqrt(max(0.0, 1.0 - dot(q, q)));
    float lon = atan(q.x, z) + uFlow * 0.15;
    float lat = asin(clamp(q.y, -1.0, 1.0));
    float grid = band(fract(lon * 12.0 / PI), 0.5, 0.04) + band(fract(lat * 10.0 / PI), 0.5, 0.04);
    col += AMBER * grid * 0.12 * z * uEnergy;
  }

  // Filamentos de energia girando em volta do núcleo.
  float warp = fbm(vec2(ang * 1.5, r * 3.0 - t * 0.4) + uFlow * 0.05);
  for (int j = 0; j < 3; j++) {
    float fj = float(j);
    float l = abs(sin(ang * (2.0 + fj) + r * (6.0 + 2.0 * fj) - uFlow * (0.6 + 0.2 * fj) + warp * 4.0));
    col += mix(GOLD, HOT, 0.4) * pow(1.0 - l, 40.0) * smoothstep(0.9, 0.12, r) * (0.35 + 0.9 * uLevel);
  }

  // Núcleo.
  float core = exp(-r * r * 9.0) * (0.75 + 1.8 * uLevel) + exp(-r * 2.6) * 0.3;
  col += mix(AMBER, HOT, smoothstep(0.0, 0.8, exp(-r * r * 9.0))) * core;
  col += AMBER * exp(-r * 1.1) * 0.12 * (1.0 + uLevel); // brilho difuso

  // Poeira ao fundo.
  float st = hash2(floor(gl_FragCoord.xy / 3.0));
  col += GOLD * step(0.9985, st) * (0.4 + 0.4 * sin(t * 2.0 + st * 60.0)) * 0.5;

  col *= uEnergy * 1.35;
  col = col / (1.0 + col * 0.6);
  outColor = vec4(pow(col, vec3(0.95)), 1.0);
}`;

// energia (brilho), velocidade de giro e pulso de "ouvindo" por estado.
const MODES = {
  sleep:     { energy: 0.35, speed: 0.2, ring: 0 },
  idle:      { energy: 0.9, speed: 0.6, ring: 0 },
  listening: { energy: 1.1, speed: 0.9, ring: 1 },
  thinking:  { energy: 1.05, speed: 3.2, ring: 0.4 },
  speaking:  { energy: 1.15, speed: 1.0, ring: 0 },
};

const lerp = (a, b, t) => a + (b - a) * t;

export class JarvisOrb {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = (this.gl = canvas.getContext("webgl2", { antialias: false, alpha: false }));
    if (!gl) throw new Error("WebGL2 indisponível neste navegador");

    const prog = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(prog, s);
    }
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {};
    for (const name of ["uRes", "uTime", "uLevel", "uFlow", "uEnergy", "uRing"]) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }

    this.target = MODES.sleep;
    this.cur = { ...MODES.sleep };
    this.level = 0;
    this.rawLevel = 0;
    this.flow = 0;
    this.last = performance.now();

    this.resize = this.resize.bind(this);
    addEventListener("resize", this.resize);
    this.resize();
    requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    // Limita a resolução: o shader é por pixel; 1.25x já fica nítido.
    const dpr = Math.min(devicePixelRatio || 1, 1.25);
    this.canvas.width = Math.round(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.round(this.canvas.clientHeight * dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  setMode(mode) {
    this.target = MODES[mode] || MODES.idle;
  }

  setLevel(level) {
    this.rawLevel = level;
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const k = 1 - Math.exp(-dt * 3);
    for (const key of ["energy", "speed", "ring"]) this.cur[key] = lerp(this.cur[key], this.target[key], k);

    // Sobe rápido e desce devagar, como um VU.
    const target = Math.min(1, this.rawLevel);
    this.level = lerp(this.level, target, 1 - Math.exp(-dt * (target > this.level ? 18 : 6)));
    this.flow += dt * (this.cur.speed + this.level * 1.5);

    const gl = this.gl, u = this.u;
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, now / 1000);
    gl.uniform1f(u.uLevel, this.level);
    gl.uniform1f(u.uFlow, this.flow);
    gl.uniform1f(u.uEnergy, this.cur.energy);
    gl.uniform1f(u.uRing, this.cur.ring);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame((t) => this.frame(t));
  }
}
