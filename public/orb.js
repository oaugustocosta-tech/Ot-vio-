// Orbe do Ultron: esfera de nebulosa animada em WebGL puro (sem Three.js).
// Mesma interface do rosto antigo: new UltronOrb(canvas), setMode(estado), setLevel(0..1).

const VERT = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uLevel;   // volume da fala, suavizado
uniform float uFlow;    // velocidade interna da nebulosa (acumulada)
uniform float uEnergy;  // brilho geral do estado
uniform float uRing;    // anel de "ouvindo"
uniform vec3 uColA, uColB, uColC;
out vec4 outColor;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                 mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                 mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 4.1); a *= 0.5; }
  return v;
}
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c,0,-s, 0,1,0, s,0,c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1,0,0, 0,c,s, 0,-s,c); }

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y) - vec2(0.0, 0.07);
  float d = length(p);
  float ang = atan(p.y, p.x);

  // Raio respira devagar e cresce com a voz; a borda ondula com o volume.
  float R = 0.21 * (1.0 + 0.16 * uLevel) + 0.006 * sin(uTime * 0.9);
  float wob = noise(vec3(cos(ang) * 1.6, sin(ang) * 1.6, uTime * 0.7)) - 0.5;
  wob += 0.5 * (noise(vec3(cos(ang) * 4.0, sin(ang) * 4.0, uTime * 1.9)) - 0.5);
  float r = R * (1.0 + wob * (0.015 + 0.16 * uLevel));

  vec3 col = vec3(0.0);

  // Poeira de estrelas ao fundo.
  vec2 sp = gl_FragCoord.xy / 2.5;
  float st = hash(vec3(floor(sp), 3.0));
  float tw = 0.5 + 0.5 * sin(uTime * (1.0 + st * 3.0) + st * 40.0);
  col += vec3(0.75, 0.8, 1.0) * step(0.9992, st) * tw * 0.45;

  // Halo externo.
  float out_ = max(d - r, 0.0);
  float halo = exp(-out_ * (9.0 - 3.0 * uLevel)) * (0.22 + 0.5 * uLevel) * uEnergy;
  col += mix(uColB, uColC, 0.35) * halo;

  // Anel fino quando está ouvindo.
  float ringR = r + 0.05 + 0.012 * sin(uTime * 3.0);
  col += uColB * uRing * 0.55 * exp(-pow((d - ringR) / 0.004, 2.0));

  // Esfera.
  if (d < r + 0.004) {
    vec2 q = p / r;
    float z = sqrt(max(0.0, 1.0 - dot(q, q)));
    vec3 n = rotX(0.35) * rotY(uFlow * 0.25) * vec3(q, z);

    vec3 w = n * 1.5 + vec3(0.0, 0.0, uFlow * 0.18);
    vec3 warp = vec3(fbm(w * 1.2 + uFlow * 0.07), fbm(w * 1.2 + 5.2), fbm(w * 1.2 - 3.1));
    float f = fbm(w + warp * (1.4 + 0.8 * uLevel));
    float g = fbm(w * 2.6 - warp - uFlow * 0.12);

    vec3 c = mix(uColA, uColB, smoothstep(0.32, 0.72, f));
    c = mix(c, uColC, smoothstep(0.5, 0.82, g) * 0.85);
    c *= 0.35 + 1.05 * f;

    // Faíscas: estrelas dentro da orbe.
    float spark = pow(noise(n * 22.0 + uFlow * 0.3), 34.0) * 6.0;
    c += vec3(1.0, 0.95, 0.9) * spark * (0.4 + uEnergy);

    // Núcleo luminoso e borda de vidro.
    float fres = pow(1.0 - z, 2.2);
    c += uColB * fres * 0.9 + vec3(0.9, 0.95, 1.0) * pow(fres, 5.0) * 0.55;
    c += mix(uColB, vec3(1.0), 0.5) * pow(z, 6.0) * (0.12 + 0.55 * uLevel) * uEnergy;
    // Reflexo especular discreto no alto à esquerda.
    c += vec3(1.0) * pow(max(dot(normalize(vec3(q, z)), normalize(vec3(-0.45, 0.55, 0.7))), 0.0), 40.0) * 0.35;

    c *= uEnergy;
    float edge = smoothstep(r + 0.003, r - 0.003, d);
    col = mix(col, c, edge);
  }

  col = col / (1.0 + col * 0.55);         // tonemap suave
  col = pow(col, vec3(0.92));
  outColor = vec4(col, 1.0);
}`;

// Paletas por estado: [fundo da nebulosa, cor principal, destaque], energia, velocidade, anel.
const MODES = {
  sleep:     { a: [0.02, 0.02, 0.06], b: [0.18, 0.2, 0.45], c: [0.3, 0.2, 0.5], energy: 0.45, speed: 0.15, ring: 0 },
  idle:      { a: [0.03, 0.02, 0.12], b: [0.32, 0.38, 1.0], c: [0.75, 0.3, 0.95], energy: 0.9, speed: 0.35, ring: 0 },
  listening: { a: [0.01, 0.06, 0.14], b: [0.2, 0.75, 1.0], c: [0.55, 0.45, 1.0], energy: 1.05, speed: 0.5, ring: 1 },
  thinking:  { a: [0.06, 0.01, 0.12], b: [0.75, 0.3, 1.0], c: [1.0, 0.7, 0.35], energy: 1.0, speed: 1.6, ring: 0 },
  speaking:  { a: [0.03, 0.02, 0.14], b: [0.4, 0.5, 1.0], c: [1.0, 0.45, 0.85], energy: 1.15, speed: 0.7, ring: 0 },
};

const lerp = (a, b, t) => a + (b - a) * t;

export class UltronOrb {
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
    for (const name of ["uRes", "uTime", "uLevel", "uFlow", "uEnergy", "uRing", "uColA", "uColB", "uColC"]) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }

    this.target = MODES.sleep;
    this.cur = structuredClone(MODES.sleep);
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
    // Limita a resolução: o shader é por pixel, e 1.5x já fica nítido.
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
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
    const c = this.cur, t = this.target;
    for (const key of ["a", "b", "c"]) for (let i = 0; i < 3; i++) c[key][i] = lerp(c[key][i], t[key][i], k);
    for (const key of ["energy", "speed", "ring"]) c[key] = lerp(c[key], t[key], k);

    // Sobe rápido e desce devagar, como um VU.
    const target = Math.min(1, this.rawLevel);
    this.level = lerp(this.level, target, 1 - Math.exp(-dt * (target > this.level ? 18 : 6)));
    this.flow += dt * (c.speed + this.level * 1.2);

    const gl = this.gl, u = this.u;
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, now / 1000);
    gl.uniform1f(u.uLevel, this.level);
    gl.uniform1f(u.uFlow, this.flow);
    gl.uniform1f(u.uEnergy, c.energy);
    gl.uniform1f(u.uRing, c.ring);
    gl.uniform3fv(u.uColA, c.a);
    gl.uniform3fv(u.uColB, c.b);
    gl.uniform3fv(u.uColC, c.c);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame((t) => this.frame(t));
  }
}
