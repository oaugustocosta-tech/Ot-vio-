// Voz do Ultron.
// - Com ELEVENLABS_API_KEY no servidor: voz neural grave, rebaixada e passada por uma
//   cadeia de efeitos (modulação em anel metálica, saturação, reverb de catedral).
// - Sem chave: voz do navegador no tom mais grave possível + ronco sub-grave sintetizado.

const MALE_PT = /antonio|daniel|ricardo|felipe|duarte|thiago|fabio|donato|julio|humberto|valerio|nicolau|male|masculin/i;

function impulse(ctx, seconds, decay) {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return buf;
}

function saturation(amount) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  return curve;
}

export class UltronVoice {
  constructor() {
    this.queue = [];
    this.busy = false;
    this.neural = false;
    this.simLevel = 0;
    this.onSpeakingChange = () => {};
    this.generation = 0;
  }

  async init() {
    const ctx = (this.ctx = new AudioContext());
    await ctx.resume();

    // Entrada da voz neural.
    this.input = ctx.createGain();

    // Graves encorpados.
    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = "lowshelf";
    lowShelf.frequency.value = 180;
    lowShelf.gain.value = 7;
    const presence = ctx.createBiquadFilter();
    presence.type = "peaking";
    presence.frequency.value = 2400;
    presence.gain.value = 3;

    // Modulação em anel -> timbre metálico/robótico.
    const ring = ctx.createGain();
    ring.gain.value = 0;
    const carrier = ctx.createOscillator();
    carrier.frequency.value = 48;
    carrier.connect(ring.gain);
    carrier.start();
    const ringMix = ctx.createGain();
    ringMix.gain.value = 0.45;

    const dry = ctx.createGain();
    dry.gain.value = 0.9;

    const shaper = ctx.createWaveShaper();
    shaper.curve = saturation(2.2);
    shaper.oversample = "4x";

    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 2.8, 2.5);
    const wet = ctx.createGain();
    wet.gain.value = 0.28;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 4;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buf = new Float32Array(this.analyser.fftSize);

    this.input.connect(lowShelf);
    lowShelf.connect(presence);
    presence.connect(dry);
    presence.connect(ring);
    ring.connect(ringMix);
    dry.connect(shaper);
    ringMix.connect(shaper);
    shaper.connect(comp);
    shaper.connect(reverb);
    reverb.connect(wet);
    wet.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    // Ronco sub-grave: hum ambiente baixo que cresce quando ele fala.
    this.rumble = ctx.createGain();
    this.rumble.gain.value = 0.015;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 120;
    for (const f of [38, 38.6, 57]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.connect(lp);
      o.start();
    }
    lp.connect(this.rumble);
    this.rumble.connect(ctx.destination);

    try {
      const cfg = await (await fetch("/api/config")).json();
      this.neural = Boolean(cfg.neuralVoice);
    } catch {
      this.neural = false;
    }

    if ("speechSynthesis" in window) {
      this.pickBrowserVoice();
      speechSynthesis.addEventListener("voiceschanged", () => this.pickBrowserVoice());
    }
  }

  pickBrowserVoice() {
    const voices = speechSynthesis.getVoices();
    const pt = voices.filter((v) => v.lang?.toLowerCase().startsWith("pt"));
    this.browserVoice =
      pt.find((v) => MALE_PT.test(v.name) && v.lang.toLowerCase() === "pt-br") ||
      pt.find((v) => MALE_PT.test(v.name)) ||
      pt.find((v) => v.lang.toLowerCase() === "pt-br") ||
      pt[0] ||
      null;
  }

  // Nível instantâneo da fala (0..1) para animar a mandíbula.
  get level() {
    if (!this.analyser) return 0;
    if (this.mode === "browser") {
      this.simLevel *= 0.9;
      return Math.min(1, this.simLevel + (this.busy ? 0.15 + Math.random() * 0.25 : 0));
    }
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (const v of this.buf) sum += v * v;
    const rms = Math.sqrt(sum / this.buf.length);
    const lvl = Math.min(1, rms * 4.5);
    this.rumble.gain.setTargetAtTime(0.015 + lvl * 0.07, this.ctx.currentTime, 0.05);
    return lvl;
  }

  say(text) {
    const clean = text.replace(/[*_#`~>\[\]]/g, "").trim();
    if (!clean) return;
    const item = { text: clean, gen: this.generation };
    // Já pede o áudio neural enquanto a frase anterior ainda está tocando.
    if (this.neural) item.audio = this.fetchNeural(clean);
    this.queue.push(item);
    this.pump();
  }

  async fetchNeural(text) {
    try {
      const r = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) return null;
      return await this.ctx.decodeAudioData(await r.arrayBuffer());
    } catch {
      return null;
    }
  }

  async pump() {
    if (this.busy) return;
    const item = this.queue.shift();
    if (!item) return;
    this.busy = true;
    this.onSpeakingChange(true);
    try {
      const buffer = item.audio ? await item.audio : null;
      if (item.gen === this.generation) {
        if (buffer) await this.playBuffer(buffer);
        else await this.speakBrowser(item.text);
      }
    } finally {
      this.busy = false;
      if (this.queue.length) this.pump();
      else this.onSpeakingChange(false);
    }
  }

  playBuffer(buffer) {
    this.mode = "neural";
    return new Promise((resolve) => {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = 0.87; // rebaixa o tom
      src.connect(this.input);
      src.onended = resolve;
      this.current = src;
      src.start();
    });
  }

  speakBrowser(text) {
    this.mode = "browser";
    if (!("speechSynthesis" in window)) return Promise.resolve();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.browserVoice?.lang || "pt-BR";
      if (this.browserVoice) u.voice = this.browserVoice;
      u.pitch = 0; // o mais grave que o navegador permite
      u.rate = 0.82;
      u.volume = 1;
      u.onstart = () => this.rumble.gain.setTargetAtTime(0.09, this.ctx.currentTime, 0.2);
      u.onboundary = () => (this.simLevel = 0.9);
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        this.rumble.gain.setTargetAtTime(0.015, this.ctx.currentTime, 0.4);
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      speechSynthesis.speak(u);
      // Salvaguarda caso o navegador nunca dispare onend.
      setTimeout(done, 2000 + text.length * 130);
    });
  }

  stop() {
    this.generation++;
    this.queue = [];
    try {
      this.current?.stop();
    } catch {}
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  }
}
