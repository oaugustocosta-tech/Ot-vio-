// Voz do Jarvis.
// - Com ELEVENLABS_API_KEY no servidor: voz neural da ElevenLabs, tocada pelo Web Audio
//   (assim a orbe acompanha o volume real da fala).
// - Sem chave: voz do navegador. No Microsoft Edge as vozes "Natural" (Antonio, Francisca...)
//   são neurais e gratuitas; é a melhor opção sem pagar nada.

// Ordem de preferência das vozes do navegador: masculinas primeiro, combinando com o Jarvis.
const PREFERRED = [
  /antonio.*natural/i,
  /(donato|fabio|humberto|julio|nicolau|valerio).*natural/i,
  /daniel|ricardo|felipe|antonio/i,
  /natural/i,
  /google.*portugu[eê]s.*brasil/i,
];

export class JarvisVoice {
  constructor() {
    this.queue = [];
    this.busy = false;
    this.neural = false;
    this.simLevel = 0;
    this.onSpeakingChange = () => {};
    this.onVoiceChange = () => {};
    this.onVoiceError = () => {};
    this.serverDownUntil = 0;
    this.generation = 0;
    this.inflight = 0; // pedidos de áudio em andamento
    this.waiters = [];
    this.currentText = ""; // frase que está tocando agora (para ele não obedecer à própria voz)
  }

  async init() {
    const ctx = (this.ctx = new AudioContext());
    await ctx.resume();

    this.input = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buf = new Float32Array(this.analyser.fftSize);
    this.input.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    this.keepAwake();

    try {
      const cfg = await (await fetch("/api/config")).json();
      this.neural = Boolean(cfg.neuralVoice);
      this.userName = cfg.name;
      this.brainName = cfg.brain;
      this.updated = cfg.atualizado;
    } catch {
      this.neural = false;
    }

    if ("speechSynthesis" in window) {
      this.pickBrowserVoice();
      speechSynthesis.addEventListener("voiceschanged", () => this.pickBrowserVoice());
    }
  }

  // Um chiado baixíssimo (inaudível) o tempo todo. Soundbars e saídas HDMI "dormem" quando
  // ficam em silêncio e cortam o começo da próxima fala; assim elas ficam sempre acordadas.
  keepAwake() {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.0002;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(ctx.destination);
    src.start();
  }

  // Por onde sai a voz (soundbar, headset...). Vazio = a saída padrão do Windows.
  async setOutput(deviceId) {
    if (!this.ctx?.setSinkId) throw new Error("Este navegador não deixa escolher a saída de som.");
    await this.ctx.setSinkId(deviceId || "");
  }

  // O navegador pode bloquear som até o primeiro clique; diz se o áudio está liberado.
  get unlocked() {
    return this.ctx?.state === "running";
  }

  pickBrowserVoice() {
    const voices = speechSynthesis.getVoices();
    const br = voices.filter((v) => v.lang?.toLowerCase().replace("_", "-") === "pt-br");
    const pt = br.length ? br : voices.filter((v) => v.lang?.toLowerCase().startsWith("pt"));
    this.browserVoice = null;
    for (const re of PREFERRED) {
      this.browserVoice = pt.find((v) => re.test(v.name));
      if (this.browserVoice) break;
    }
    this.browserVoice ??= pt[0] || null;
  }

  // Nível instantâneo da fala (0..1) para animar a orbe.
  get level() {
    if (!this.analyser) return 0;
    if (this.mode === "browser") {
      // A voz do navegador não passa pelo Web Audio: simula o ritmo das sílabas.
      this.simLevel *= 0.88;
      if (!this.busy) return this.simLevel;
      const t = performance.now() / 1000;
      const syll = Math.max(0, Math.sin(t * 11) * 0.5 + Math.sin(t * 17.3) * 0.35 + 0.2);
      return Math.min(1, Math.max(this.simLevel, syll * 0.75));
    }
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (const v of this.buf) sum += v * v;
    return Math.min(1, Math.sqrt(sum / this.buf.length) * 4.5);
  }

  say(text) {
    const clean = text.replace(/[*_#`~>\[\]]/g, "").trim();
    if (!clean) return;
    const item = { text: clean, gen: this.generation };
    // Já pede o áudio neural enquanto a frase anterior ainda está tocando.
    if (this.neural) item.audio = this.fetchNeural(clean, item.gen);
    this.queue.push(item);
    this.pump();
  }

  // No máximo dois pedidos de áudio por vez: o plano grátis da ElevenLabs recusa mais que isso,
  // e cada recusa fazia a voz trocar ou engasgar no meio de uma resposta longa.
  async slot() {
    if (this.inflight < 2) return void this.inflight++;
    await new Promise((resolve) => this.waiters.push(resolve));
  }

  release() {
    const next = this.waiters.shift();
    if (next) next();
    else this.inflight--;
  }

  async fetchNeural(text, gen) {
    await this.slot();
    try {
      // Cortado enquanto esperava a vez: nem pede.
      if (gen !== this.generation) return null;
      return await this.requestNeural(text);
    } finally {
      this.release();
    }
  }

  async requestNeural(text) {
    // Se a voz do servidor acabou de falhar, nem tenta: fala na hora com a do navegador.
    if (Date.now() < this.serverDownUntil) return null;
    try {
      const r = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) {
        const why = (await r.json().catch(() => ({}))).error;
        if (why) this.onVoiceError(why);
        throw new Error(`HTTP ${r.status}`);
      }
      this.setVoiceName(r.headers.get("X-Jarvis-Voice") || "servidor");
      return await this.ctx.decodeAudioData(await r.arrayBuffer());
    } catch {
      this.serverDownUntil = Date.now() + 15_000; // internet oscilando: tenta de novo logo
      return null;
    }
  }

  setVoiceName(name) {
    if (name === this.voiceName) return;
    this.voiceName = name;
    this.onVoiceChange(name);
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
        this.currentText = item.text;
        if (buffer) await this.playBuffer(buffer);
        else await this.speakBrowser(item.text);
      }
    } finally {
      this.currentText = "";
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
      src.connect(this.input);
      src.onended = resolve;
      this.current = src;
      src.start();
    });
  }

  speakBrowser(text) {
    this.mode = "browser";
    this.setVoiceName("navegador");
    if (!("speechSynthesis" in window)) return Promise.resolve();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.browserVoice?.lang || "pt-BR";
      if (this.browserVoice) u.voice = this.browserVoice;
      u.pitch = 1;
      u.rate = 1.05;
      u.volume = 1;
      u.onboundary = () => (this.simLevel = 0.9);
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      speechSynthesis.speak(u);
      // Salvaguarda caso o navegador nunca dispare onend.
      setTimeout(done, 2500 + text.length * 110);
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
