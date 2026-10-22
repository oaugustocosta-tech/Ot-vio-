import { JarvisOrb } from "./orb.js";
import { JarvisVoice } from "./voice.js";
import { initModes } from "./modos.js";

const $ = (id) => document.getElementById(id);
const orb = new JarvisOrb($("scene"));
const voice = new JarvisVoice();
window.jarvis = { orb, voice }; // útil para depurar no console

const history = []; // { role: "user" | "assistant", content }
let busy = false; // esperando a resposta do cérebro
let speaking = false;
let hearing = false; // ele está falando agora
let active = false; // em conversa: ouve sem precisar dizer "Jarvis"
let sleepAfter = false; // despedida: volta a esperar o "Jarvis" depois de responder
let off = false; // desativado: só volta com "ativar Jarvis"
let controller = null;

// Quanto tempo ele continua ouvindo sem precisar do "Jarvis" depois de responder.
const ACTIVE_MS = 20_000;

// "Jarvis" do jeito que o reconhecimento de voz costuma escrever.
const WAKE = /\bd?j[aáe]r[vb][iíae]?[sz]?\b/gi;
const FILLER = /^(ativar|ativa|acordar|acorda|olá|ola|oi|ei|hey|ok|fala|e aí|e ai)(?=[\s,.!?]|$)/i;
const FAREWELL = /\b(pode (descansar|dormir|parar|ir)|dispensado|tchau|at[eé] (mais|logo)|s[oó] isso|obrigad[oa]|valeu)\b/i;
// Comandos de controle do próprio Jarvis, tratados aqui mesmo (sem passar pelo cérebro).
// Valem só quando a frase é basicamente o comando, para "desliga o LED" não desligar o Jarvis.
const OFF_CMD = /^(pode )?(se )?(desativ\w*( (o )?(jarvis|microfone|escuta))?|modo (silencioso|soneca|off)|para de (me )?(ouvir|escutar)|n[aã]o me (ouve|ou[cç]a|escuta)|fica (quieto|em sil[eê]ncio))$/i;
const SHUTDOWN_CMD = /^(pode )?(se )?(deslig\w*|fech\w*|encerr\w*)( (o )?(jarvis|sistema))?$/i;
const WAKE_UP = /\b(ativ\w*|acord\w*|volt\w*|liga\w*)\b/i;
// "Jarvis, para", "chega", "já entendi": corta a fala na hora.
const STOP_CMD = /^(ok |t[aá] |j[aá] )?(para|pare|parar|pode parar|para de falar|para a[ií]|chega|basta|cala( a boca)?|sil[eê]ncio|j[aá] (entendi|deu|chega|t[aá] bom)|entendi|t[aá] bom|beleza|stop)( (jarvis|por favor|obrigad[oa]))?$/i;

const hasWake = (text) => text.search(WAKE) >= 0;

// Tira o "Jarvis" e palavras de chamada ("olá", "ativar") e devolve só o pedido.
function stripWake(text) {
  let t = text.replace(WAKE, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/^[\s,.!?]+|[\s,.!?]+$/g, "");
  for (let i = 0; i < 2; i++) t = t.replace(FILLER, "").replace(/^[\s,.!?]+/, "");
  return /\p{L}{2}/u.test(t) ? t : "";
}

// --- Estado visual -----------------------------------------------------------
const LABELS = { off: "desativado", sleep: 'diga "Jarvis"', listening: "ouvindo", thinking: "pensando", speaking: "falando" };

function setState() {
  const state = speaking ? "speaking" : busy ? "thinking" : active || hearing ? "listening" : off ? "off" : "sleep";
  $("statusText").textContent = LABELS[state];
  const st = $("statusText").parentElement;
  st.classList.toggle("on", state !== "sleep" && state !== "off");
  st.classList.toggle("pulse", state === "thinking" || state === "speaking");
  orb.setMode(state);
}

(function levelLoop() {
  orb.setLevel(voice.level);
  requestAnimationFrame(levelLoop);
})();

const ACTIONS = {
  abrir_site: "abrindo site",
  pesquisar: "pesquisando",
  abrir_programa: "abrindo programa",
  fechar_programa: "fechando programa",
  janela_jarvis: "janela do Jarvis",
  ativar_modo: "ativando modo",
  controlar_midia: "controlando mídia",
  bloquear_computador: "bloqueando o computador",
};

function logLine(role, text) {
  const p = document.createElement("p");
  p.className = role;
  const b = document.createElement("b");
  b.textContent = role === "user" ? "VOCÊ" : "JARVIS";
  p.append(b, document.createElement("span"));
  p.lastChild.textContent = text;
  $("log").append(p);
  $("log").scrollTop = $("log").scrollHeight;
  return p;
}

// Aviso curto no rodapé (o texto da conversa só aparece no chat).
let toastTimer = null;
function notice(text, ms = 7000) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), ms);
}

// Bipes de ativar e desativar, para saber que ele ouviu sem olhar a tela.
function chime(up) {
  const ctx = voice.ctx;
  if (!ctx) return;
  const t = ctx.currentTime;
  const notes = up ? [660, 990] : [740, 494];
  notes.forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t + i * 0.09);
    g.gain.linearRampToValueAtTime(0.12, t + i * 0.09 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.22);
    o.connect(g).connect(ctx.destination);
    o.start(t + i * 0.09);
    o.stop(t + i * 0.09 + 0.25);
  });
}

// --- Modo conversa -----------------------------------------------------------
let idleTimer = null;
function armIdle() {
  clearTimeout(idleTimer);
  if (!active) return;
  idleTimer = setTimeout(() => {
    if (busy || speaking || hearing) armIdle();
    else goSleep();
  }, ACTIVE_MS);
}

function activate(withChime) {
  if (!active && withChime) chime(true);
  active = true;
  setState();
  armIdle();
}

function goSleep() {
  clearTimeout(idleTimer);
  if (!active) return;
  active = false;
  hearing = false;
  chime(false);
  setState();
}

// --- Conversa com o cérebro --------------------------------------------------
// Separa frases completas para a voz começar antes do texto terminar.
const SENTENCE = /^[\s\S]*?[.!?…]+["”»')]*\s+/;

async function ask(userText) {
  userText = userText.trim();
  if (!userText) return;
  voice.stop();
  controller?.abort();
  activate(false);

  history.push({ role: "user", content: userText });
  logLine("user", userText);
  busy = true;
  setState();

  controller = new AbortController();
  let full = "";
  let pending = "";
  const logEl = logLine("assistant", "");
  const logText = logEl.querySelector("span");

  const flushSentences = (final) => {
    let m;
    while ((m = pending.match(SENTENCE)) && m[0].trim()) {
      voice.say(m[0]);
      pending = pending.slice(m[0].length);
    }
    if (final && pending.trim()) {
      voice.say(pending);
      pending = "";
    }
  };

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const event = raw.match(/^event: (.*)$/m)?.[1];
        const data = JSON.parse(raw.match(/^data: (.*)$/m)?.[1] ?? "null");
        if (event === "text") {
          full += data;
          pending += data;
          logText.textContent = full;
          flushSentences(false);
        } else if (event === "action") {
          const act = document.createElement("i");
          act.textContent = `→ ${ACTIONS[data] || data}`;
          logEl.append(act);
        } else if (event === "error") {
          throw new Error(data);
        }
      }
    }
    flushSentences(true);
    if (full.trim()) history.push({ role: "assistant", content: full });
    else history.pop();
  } catch (err) {
    if (err.name === "AbortError") {
      // Cortado no meio ("Jarvis, para"): guarda o que ele chegou a dizer.
      if (full.trim()) history.push({ role: "assistant", content: full });
      else history.pop();
      return;
    }
    history.pop();
    logText.textContent = `Falha: ${err.message}`;
    notice(err.message);
    voice.say("Perdão, senhor. Tive um problema para responder agora.");
  } finally {
    busy = false;
    setState();
    if (!speaking) afterTurn();
  }
}

// Fim de uma resposta: volta a ouvir e, se foi despedida, volta a esperar o "Jarvis".
function afterTurn() {
  if (sleepAfter) {
    sleepAfter = false;
    goSleep();
  } else {
    armIdle();
  }
  listenSoon();
}

// --- Reconhecimento de voz ---------------------------------------------------
// Fica ligado o tempo todo (também com a janela minimizada), mas só reage quando ouve "Jarvis".
// Enquanto ele fala ou pensa, só aceita "para": o resto pode ser a própria voz saindo na caixa.
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null;
let recogOn = false;
let micAllowed = true;
let retryDelay = 300;
let listenTimer = null;
let ignoreUntil = 0; // logo depois de cortar a fala, ignora o resto do "para de falar"

// Saída de som escolhida no painel Ajustes (vazio = o padrão do Windows).
const audio = { out: "" };
try {
  audio.out = JSON.parse(localStorage.getItem("jarvis.audio") || "{}").out || "";
} catch {}

function listenSoon(delay = 250) {
  clearTimeout(listenTimer);
  listenTimer = setTimeout(startListening, delay);
}

function startListening() {
  if (!Recognition || !micAllowed || recogOn) return;
  recog = new Recognition();
  recog.lang = "pt-BR";
  recog.continuous = true;
  recog.interimResults = true;
  recog.onresult = onResult;
  recog.onstart = () => (retryDelay = 300);
  recog.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      micAllowed = false;
      notice("Microfone bloqueado. Libere o microfone para o Jarvis no cadeado da barra do Edge.");
    } else if (e.error === "audio-capture") {
      retryDelay = 5000;
      notice("Não encontrei microfone. Confira se o headset está conectado.");
    } else if (e.error === "network") {
      retryDelay = Math.min(15_000, retryDelay * 2);
    }
  };
  recog.onend = () => {
    recogOn = false;
    if (hearing) {
      hearing = false;
      setState();
    }
    listenSoon(retryDelay);
  };
  try {
    recog.start();
    recogOn = true;
  } catch {
    listenSoon(1000);
  }
}

// Recomeça a escuta do zero, jogando fora o que estava sendo ouvido.
function restartListening() {
  if (recog && recogOn) recog.abort();
  else listenSoon();
}

// "Jarvis, para" enquanto ele fala ou pensa.
function isStopCmd(text) {
  const wake = hasWake(text);
  if (!wake && !active) return false;
  const cmd = stripWake(text).replace(/[.,!?]/g, "").replace(/\s+/g, " ").trim();
  if (!STOP_CMD.test(cmd)) return false;
  if (wake) return true;
  // Sem o nome, só vale se não for um pedaço do que ele mesmo está dizendo ("para" é comum).
  return !voice.currentText.toLowerCase().includes(cmd.toLowerCase());
}

// Corta a fala e a resposta que ainda estava chegando.
function interrupt() {
  ignoreUntil = Date.now() + 1500;
  controller?.abort();
  voice.stop();
  setState();
}

function onResult(e) {
  let finalText = "";
  let interim = "";
  for (let i = e.resultIndex; i < e.results.length; i++) {
    const r = e.results[i];
    if (r.isFinal) finalText += r[0].transcript;
    else interim += r[0].transcript;
  }
  const heard = `${finalText} ${interim}`.trim();
  if (Date.now() < ignoreUntil) return;
  if (busy || speaking) {
    if (!off && heard && isStopCmd(heard)) interrupt();
    return;
  }
  // Resposta imediata ao ouvir "Jarvis", antes mesmo de ele terminar a frase.
  if (!off && !hearing && heard && (active || hasWake(heard))) {
    hearing = true;
    if (!active) chime(true);
    setState();
  }
  if (!finalText.trim()) return;
  hearing = false;
  handleUtterance(finalText.trim());
}

const isFarewellOnly = (t) =>
  FAREWELL.test(t) &&
  !t
    .replace(new RegExp(FAREWELL.source, "gi"), " ")
    .replace(/\b(senhor|jarvis|muito|por (hoje|enquanto|agora)|e|a[ií])\b|[,.!?]/gi, " ")
    .trim();

// Fala curta do próprio Jarvis, sem passar pelo cérebro.
function sayLocal(text) {
  logLine("assistant", text);
  history.push({ role: "assistant", content: text });
  voice.say(text);
}

function turnOff() {
  off = true;
  sleepAfter = false;
  goSleep();
  sayLocal('Certo, senhor. Fico desativado até o senhor dizer "ativar Jarvis".');
}

function turnOn() {
  off = false;
  activate(true);
  sayLocal("De volta, senhor. Em que posso ajudar?");
}

function shutdown() {
  off = true;
  goSleep();
  sayLocal("Desligando. Até logo, senhor.");
  // Espera a despedida terminar e pede ao servidor para fechar tudo.
  const bye = () => fetch("/api/desligar", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
  setTimeout(bye, 3500);
}

function handleUtterance(text) {
  if (off) {
    // Desativado: só "ativar Jarvis" (ou "Jarvis, acorda", "Jarvis, volta") traz de volta.
    if (hasWake(text) && WAKE_UP.test(text)) turnOn();
    return;
  }
  if (!active && !hasWake(text)) {
    setState();
    return; // conversa no ambiente, TV, música: ignora
  }
  const cmd = stripWake(text);
  // "desliga o Jarvis" vira "desliga o" depois de tirar o nome.
  const bare = cmd.replace(/[.!?]+$/, "").replace(/\s+(o|a)$/i, "");
  // "para" depois que ele já terminou de falar: não há nada para cortar.
  if (STOP_CMD.test(bare.replace(/[,]/g, ""))) return activate(false);
  if (bare && SHUTDOWN_CMD.test(bare)) return shutdown();
  if (bare && OFF_CMD.test(bare)) return turnOff();
  // Só despedida ("obrigado", "pode descansar"): responde na hora e volta a esperar o nome.
  if (isFarewellOnly(cmd || text)) {
    active = true; // para o bipe de descida tocar
    goSleep();
    sayLocal("Às ordens, senhor.");
    return;
  }
  activate(false); // o bipe já tocou quando ele ouviu o nome
  if (!cmd) return; // só chamou: espera o pedido
  if (FAREWELL.test(text)) sleepAfter = true;
  ask(cmd);
}

voice.onSpeakingChange = (on) => {
  speaking = on;
  // Ao terminar de falar, recomeça a escuta para não confundir o fim da própria voz com um pedido.
  if (!on) restartListening();
  setState();
  if (!on && !busy) afterTurn();
};

// --- Interface ---------------------------------------------------------------
// Clicar no reator: chama o Jarvis (ou corta a fala dele).
$("scene").addEventListener("click", () => {
  if (!voice.ctx) return;
  if (speaking || busy) {
    interrupt();
    return;
  }
  if (off) turnOn();
  else if (active) goSleep();
  else activate(true);
});

$("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = $("text").value;
  $("text").value = "";
  ask(t);
});

// Painéis do canto direito (Chat, Modos e Ajustes): um de cada vez.
const PANELS = ["chat", "modes", "audio"];
function setPanel(name) {
  for (const p of PANELS) {
    document.body.classList.toggle(p, p === name);
    $(`${p}Toggle`).setAttribute("aria-pressed", String(p === name));
  }
  try {
    localStorage.setItem("jarvis.panel", name || "");
  } catch {}
  if (name === "chat") $("text").focus();
  if (name === "audio") {
    fillDevices();
    fillKeys();
  }
}
for (const p of PANELS) {
  $(`${p}Toggle`).addEventListener("click", () => setPanel(document.body.classList.contains(p) ? null : p));
}
try {
  const saved = localStorage.getItem("jarvis.panel");
  if (PANELS.includes(saved)) setPanel(saved);
} catch {}
initModes();

// --- Painel Ajustes: diagnóstico e por onde sai a voz dele ---------------------------
// O microfone não dá para escolher aqui: o reconhecimento de voz do Edge sempre usa o
// microfone padrão do Windows (Configurações > Sistema > Som > Entrada).
function audioMsg(text, ok = true) {
  $("audioMsg").textContent = text;
  $("audioMsg").classList.toggle("ok", ok);
}

async function fillDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  let devices = await navigator.mediaDevices.enumerateDevices();
  // Sem permissão do microfone o navegador esconde os nomes: pede uma vez.
  if (devices.some((d) => !d.label)) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch {}
  }
  const sel = $("outSel");
  sel.innerHTML = "";
  sel.append(new Option("Padrão do Windows", ""));
  for (const d of devices) {
    if (d.kind !== "audiooutput" || d.deviceId === "default" || d.deviceId === "communications") continue;
    sel.append(new Option(d.label || "Dispositivo sem nome", d.deviceId));
  }
  sel.value = [...sel.options].some((o) => o.value === audio.out) ? audio.out : "";
  sel.disabled = !voice.ctx?.setSinkId;
}

function saveAudio() {
  try {
    localStorage.setItem("jarvis.audio", JSON.stringify(audio));
  } catch {}
}

async function applyOutput() {
  if (!audio.out || !voice.ctx) return;
  try {
    await voice.setOutput(audio.out);
  } catch {
    notice("Não achei a saída de som escolhida. Usando o padrão do Windows.");
  }
}

$("outSel").addEventListener("change", async () => {
  audio.out = $("outSel").value;
  saveAudio();
  if (!voice.ctx) return;
  try {
    await voice.setOutput(audio.out);
    audioMsg("Saída trocada.");
    chime(true);
  } catch (err) {
    audioMsg(err.message, false);
  }
});
// Chaves: mostra quais já estão salvas e manda as novas para o servidor.
async function fillKeys() {
  try {
    const k = await (await fetch("/api/chaves")).json();
    for (const nome of ["GROQ_API_KEY", "ELEVENLABS_API_KEY", "AZURE_SPEECH_KEY"]) {
      $(`k_${nome}`).textContent = k[nome] ? "✓ salva" : "";
    }
    const f = $("keysForm");
    f.JARVIS_VOZ.value = k.JARVIS_VOZ || "daniel";
    f.AZURE_SPEECH_REGION.value = k.AZURE_SPEECH_REGION || "";
  } catch {}
}

$("keysForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const novas = {};
  for (const el of f.elements) {
    if (!el.name) continue;
    const v = el.value.trim();
    if (v) novas[el.name] = v; // campo vazio: mantém a chave que já está salva
  }
  const msg = $("keysMsg");
  try {
    const r = await fetch("/api/chaves", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(novas) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `erro ${r.status}`);
    msg.classList.add("ok");
    msg.textContent = "Salvo. Reiniciando o Jarvis…";
    setTimeout(() => location.reload(), 3000);
  } catch (err) {
    msg.classList.remove("ok");
    msg.textContent = err.message;
  }
});

$("diagRun").addEventListener("click", async () => {
  const list = $("diagList");
  const btn = $("diagRun");
  btn.disabled = true;
  list.innerHTML = "<li>Testando, leva alguns segundos…</li>";
  try {
    const r = await fetch("/api/diagnostico");
    const itens = await r.json();
    list.innerHTML = "";
    for (const t of itens) {
      const li = document.createElement("li");
      li.className = t.ok ? "ok" : "erro";
      const b = document.createElement("b");
      b.textContent = `${t.ok ? "✓" : "✗"} ${t.nome}`;
      const small = document.createElement("small");
      small.textContent = [t.detalhe, t.ms >= 100 ? `${(t.ms / 1000).toFixed(1)} s` : ""].filter(Boolean).join(" · ");
      li.append(b, small);
      list.append(li);
    }
  } catch {
    list.innerHTML = "<li class=\"erro\"><b>✗ O servidor do Jarvis não respondeu.</b></li>";
  } finally {
    btn.disabled = false;
  }
});

$("audioTest").addEventListener("click", () => {
  if (!voice.ctx) return;
  voice.say("Testando, senhor. Esta é a minha voz.");
});
navigator.mediaDevices?.addEventListener?.("devicechange", () => {
  if (document.body.classList.contains("audio")) fillDevices();
});

// Leitura no canto da tela: qual cérebro e qual voz estão em uso.
function updateReadout() {
  const el = $("readout");
  el.innerHTML = "";
  for (const [k, v] of [["cérebro", voice.brainName], ["voz", voice.voiceName]]) {
    if (!v) continue;
    const line = document.createElement("div");
    const b = document.createElement("b");
    b.textContent = v;
    line.append(`${k}: `, b);
    el.append(line);
  }
}
voice.onVoiceChange = updateReadout;
// Se a voz do servidor falhar, mostra o motivo uma vez (por exemplo, chave sem permissão).
const voiceErrors = new Set();
voice.onVoiceError = (why) => {
  if (voiceErrors.has(why)) return;
  voiceErrors.add(why);
  notice(why, 15_000);
  logLine("assistant", `[voz] ${why}`);
};

function greeting() {
  const h = new Date().getHours();
  const hello = h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const novo = voice.updated ? " Acabei de receber uma atualização." : "";
  return `${hello}, senhor.${novo} Todos os sistemas estão online. Em que posso ajudar?`;
}

function wake() {
  $("boot").classList.add("gone");
  updateReadout();
  if (!Recognition) notice("Este navegador não reconhece voz. Use o Microsoft Edge, ou abra o chat para digitar.");
  else if (voice.updated) notice(`Atualizado: ${voice.updated.resumo || voice.updated.versao}`, 12_000);
  const hello = greeting();
  logLine("assistant", hello);
  history.push({ role: "user", content: `(${voice.userName || "Otávio"} acabou de abrir o Jarvis.)` }, { role: "assistant", content: hello });
  activate(false); // depois do bom-dia já pode falar sem dizer "Jarvis"
  voice.say(hello);
  listenSoon();
}

$("wake").addEventListener("click", async () => {
  if (!voice.ctx) await voice.init();
  else await voice.ctx.resume();
  await applyOutput();
  wake();
});

setState();

// Aberto pelo atalho (?auto): acorda sozinho. Se o navegador ainda bloquear o som, o botão
// DESPERTAR fica na tela. Quando abre junto com o Windows (&rotina), roda a rotina.txt.
const params = new URLSearchParams(location.search);
if (params.has("rotina")) fetch("/api/rotina", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
if (params.has("auto")) {
  voice.init().then(async () => {
    await applyOutput();
    if (voice.unlocked) wake();
  });
}
