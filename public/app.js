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
let controller = null;

// Quanto tempo ele continua ouvindo sem precisar do "Jarvis" depois de responder.
const ACTIVE_MS = 20_000;

// "Jarvis" do jeito que o reconhecimento de voz costuma escrever.
const WAKE = /\bd?j[aáe]r[vb][iíae]?[sz]?\b/gi;
const FILLER = /^(ativar|ativa|acordar|acorda|olá|ola|oi|ei|hey|ok|fala|e aí|e ai)(?=[\s,.!?]|$)/i;
const FAREWELL = /\b(pode (descansar|dormir|parar|ir)|desativ\w*|dispensado|tchau|at[eé] (mais|logo)|s[oó] isso|obrigad[oa],? jarvis)\b/i;

const hasWake = (text) => text.search(WAKE) >= 0;

// Tira o "Jarvis" e palavras de chamada ("olá", "ativar") e devolve só o pedido.
function stripWake(text) {
  let t = text.replace(WAKE, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/^[\s,.!?]+|[\s,.!?]+$/g, "");
  for (let i = 0; i < 2; i++) t = t.replace(FILLER, "").replace(/^[\s,.!?]+/, "");
  return /\p{L}{2}/u.test(t) ? t : "";
}

// --- Estado visual -----------------------------------------------------------
const LABELS = { sleep: 'diga "Jarvis"', listening: "ouvindo", thinking: "pensando", speaking: "falando" };

function setState() {
  const state = speaking ? "speaking" : busy ? "thinking" : active || hearing ? "listening" : "sleep";
  $("statusText").textContent = LABELS[state];
  const st = $("statusText").parentElement;
  st.classList.toggle("on", state !== "sleep");
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
function notice(text) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 7000);
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
  pauseListening();
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
    if (err.name === "AbortError") return;
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
// Enquanto ele fala ou pensa, o microfone pausa para não ouvir a própria voz.
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null;
let recogOn = false;
let micAllowed = true;
let retryDelay = 300;
let listenTimer = null;

function listenSoon(delay = 250) {
  clearTimeout(listenTimer);
  listenTimer = setTimeout(startListening, delay);
}

function startListening() {
  if (!Recognition || !micAllowed || recogOn || busy || speaking) return;
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

function pauseListening() {
  clearTimeout(listenTimer);
  if (recog && recogOn) recog.abort();
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
  // Resposta imediata ao ouvir "Jarvis", antes mesmo de ele terminar a frase.
  if (!hearing && heard && (active || hasWake(heard))) {
    hearing = true;
    if (!active) chime(true);
    setState();
  }
  if (!finalText.trim()) return;
  hearing = false;
  handleUtterance(finalText.trim());
}

function handleUtterance(text) {
  if (!active) {
    if (!hasWake(text)) {
      setState();
      return; // conversa no ambiente, TV, música: ignora
    }
    const cmd = stripWake(text);
    activate(false); // o bipe já tocou quando ele ouviu o nome
    if (cmd) {
      if (FAREWELL.test(text)) sleepAfter = true;
      ask(cmd);
    }
    return;
  }
  if (FAREWELL.test(text)) sleepAfter = true;
  ask(stripWake(text) || text);
}

voice.onSpeakingChange = (on) => {
  speaking = on;
  if (on) pauseListening();
  setState();
  if (!on && !busy) afterTurn();
};

// --- Interface ---------------------------------------------------------------
// Clicar no reator: chama o Jarvis (ou corta a fala dele).
$("scene").addEventListener("click", () => {
  if (!voice.ctx) return;
  if (speaking) {
    voice.stop();
    return;
  }
  if (active) goSleep();
  else activate(true);
});

$("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = $("text").value;
  $("text").value = "";
  ask(t);
});

// Painéis do canto direito (Chat e Modos): um de cada vez.
function setPanel(name) {
  for (const p of ["chat", "modes"]) {
    document.body.classList.toggle(p, p === name);
    $(`${p}Toggle`).setAttribute("aria-pressed", String(p === name));
  }
  try {
    localStorage.setItem("jarvis.panel", name || "");
  } catch {}
  if (name === "chat") $("text").focus();
}
for (const p of ["chat", "modes"]) {
  $(`${p}Toggle`).addEventListener("click", () => setPanel(document.body.classList.contains(p) ? null : p));
}
try {
  const saved = localStorage.getItem("jarvis.panel");
  if (saved === "chat" || saved === "modes") setPanel(saved);
} catch {}
initModes();

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

function greeting() {
  const h = new Date().getHours();
  const hello = h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  return `${hello}, senhor. Todos os sistemas estão online. Em que posso ajudar?`;
}

function wake() {
  $("boot").classList.add("gone");
  updateReadout();
  if (!Recognition) notice("Este navegador não reconhece voz. Use o Microsoft Edge, ou abra o chat para digitar.");
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
  wake();
});

setState();

// Aberto pelo atalho (?auto): acorda sozinho. Se o navegador ainda bloquear o som, o botão
// DESPERTAR fica na tela. Quando abre junto com o Windows (&rotina), roda a rotina.txt.
const params = new URLSearchParams(location.search);
if (params.has("rotina")) fetch("/api/rotina", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
if (params.has("auto")) {
  voice.init().then(() => {
    if (voice.unlocked) wake();
  });
}
