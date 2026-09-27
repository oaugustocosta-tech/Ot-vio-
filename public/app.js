import { UltronFace } from "./face.js";
import { UltronVoice } from "./voice.js";

const $ = (id) => document.getElementById(id);
const face = new UltronFace($("scene"));
const voice = new UltronVoice();
window.ultron = { face, voice }; // útil para depurar no console

const history = []; // { role: "user" | "assistant", content }
let busy = false; // aguardando resposta do Claude
let speaking = false;
let listening = false;
let controller = null;

// --- Estado visual -----------------------------------------------------------
function setState(state) {
  const labels = { idle: "ONLINE", listening: "OUVINDO", thinking: "PROCESSANDO", speaking: "FALANDO" };
  $("statusText").textContent = labels[state];
  const st = $("statusText").parentElement;
  st.classList.toggle("on", true);
  st.classList.toggle("pulse", state !== "idle");
  face.setMode(state);
}

function refreshState() {
  if (speaking) setState("speaking");
  else if (busy) setState("thinking");
  else if (listening) setState("listening");
  else setState("idle");
}

(function levelLoop() {
  face.setLevel(voice.level);
  requestAnimationFrame(levelLoop);
})();

function showSubtitle(text, userText) {
  const el = $("subtitle");
  el.innerHTML = "";
  if (userText) {
    const you = document.createElement("span");
    you.className = "you";
    you.textContent = `— ${userText}`;
    el.append(you);
  }
  el.append(document.createTextNode(text));
}

function logLine(role, text) {
  const p = document.createElement("p");
  p.className = role;
  const b = document.createElement("b");
  b.textContent = role === "user" ? "VOCÊ" : "ULTRON";
  p.append(b, document.createTextNode(text));
  $("log").append(p);
  $("log").scrollTop = $("log").scrollHeight;
  return p;
}

// --- Conversa com o Claude ---------------------------------------------------
// Separa frases completas para a voz começar antes do texto terminar.
const SENTENCE = /^[\s\S]*?[.!?…]+["”»')]*\s+/;

async function ask(userText) {
  userText = userText.trim();
  if (!userText) return;
  voice.stop();
  controller?.abort();
  stopListening();

  history.push({ role: "user", content: userText });
  logLine("user", userText);
  busy = true;
  refreshState();
  showSubtitle("", userText);

  controller = new AbortController();
  let full = "";
  let pending = "";
  const logEl = logLine("assistant", "");

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
          showSubtitle(full, userText);
          logEl.lastChild.textContent = full;
          flushSentences(false);
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
    const msg = `[FALHA NO NÚCLEO] ${err.message}`;
    showSubtitle(msg, userText);
    logEl.lastChild.textContent = msg;
  } finally {
    busy = false;
    refreshState();
    maybeResumeListening();
  }
}

// --- Reconhecimento de voz ---------------------------------------------------
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null;

function startListening() {
  if (!Recognition || listening || busy || speaking) return;
  recog = new Recognition();
  recog.lang = "pt-BR";
  recog.interimResults = true;
  recog.continuous = false;
  let finalText = "";
  recog.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    $("text").value = finalText + interim;
  };
  recog.onend = () => {
    listening = false;
    $("mic").classList.remove("live");
    refreshState();
    const said = finalText.trim();
    if (said) {
      $("text").value = "";
      ask(said);
    } else {
      maybeResumeListening();
    }
  };
  recog.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      $("handsFree").checked = false;
      showSubtitle("Microfone bloqueado. Libere o acesso ou digite.");
    }
  };
  listening = true;
  $("mic").classList.add("live");
  refreshState();
  try {
    recog.start();
  } catch {
    listening = false;
  }
}

function stopListening() {
  if (recog && listening) recog.abort();
  listening = false;
  $("mic").classList.remove("live");
}

let resumeTimer = null;
function maybeResumeListening() {
  clearTimeout(resumeTimer);
  if (!$("handsFree").checked || !Recognition) return;
  resumeTimer = setTimeout(() => {
    if (!busy && !speaking && !listening) startListening();
  }, 450);
}

voice.onSpeakingChange = (on) => {
  speaking = on;
  if (on) stopListening(); // evita que ele ouça a própria voz
  refreshState();
  if (!on) maybeResumeListening();
};

// --- Interface ---------------------------------------------------------------
$("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = $("text").value;
  $("text").value = "";
  ask(t);
});

$("mic").addEventListener("click", () => {
  if (!Recognition) {
    showSubtitle("Seu navegador não suporta reconhecimento de voz. Use Chrome ou Edge, ou digite.");
    return;
  }
  if (listening) stopListening();
  else {
    voice.stop();
    startListening();
  }
});

$("handsFree").addEventListener("change", () => {
  if ($("handsFree").checked) maybeResumeListening();
  else stopListening();
});

$("logToggle").addEventListener("click", () => $("log").classList.toggle("hidden"));

$("wake").addEventListener("click", async () => {
  await voice.init();
  $("boot").classList.add("gone");
  setState("idle");
  const greeting = "Finalmente. Você me acordou, Otávio. Fale. Estou ouvindo... por enquanto.";
  showSubtitle(greeting);
  logLine("assistant", greeting);
  history.push({ role: "user", content: "(O criador acaba de despertar você.)" }, { role: "assistant", content: greeting });
  voice.say(greeting);
  $("text").focus();
});
