// Voz do Jarvis gerada no servidor, devolvida como MP3. Tenta, nesta ordem:
// 1. ElevenLabs (se houver ELEVENLABS_API_KEY): a mais realista. O plano grátis dá ~20 minutos
//    de fala por mês com o modelo Flash; quando acabar, passa sozinho para a próxima.
// 2. Vozes neurais da Microsoft (as do "Ler em voz alta" do Edge), grátis, sem chave.
//    Não é uma API oficial.
// Se nada funcionar, o servidor responde erro e o navegador fala com a voz dele.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { motivoRede } from "./rede.js";
import { dado } from "./dados.js";

const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY || "";
// Vozes prontas da ElevenLabs no estilo do Jarvis. Escolha pelo nome com JARVIS_VOZ no .env,
// ou cole o ID de qualquer voz da biblioteca em ELEVENLABS_VOICE_ID.
export const VOZES = {
  daniel: "onwK4e9ZLuTAKqWW03F9", // britânico, sério e elegante (padrão)
  george: "JBFqnCBsd6RMkjVDRZzb", // britânico, mais caloroso
  brian: "nPczCjzI2devNBz1zQrb", // americano, grave
  alice: "Xb7hH8MSUJpSbSDYk0k2", // britânica, firme (feminina)
  lily: "pFZP5JQG7iQjIQuC4Bku", // britânica, suave (feminina)
};
const VOZ = (process.env.JARVIS_VOZ || "daniel").toLowerCase();
const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE_ID || VOZES[VOZ] || VOZES.daniel;
const ELEVEN_NAME = process.env.ELEVENLABS_VOICE_ID ? "ElevenLabs" : `ElevenLabs - ${VOZES[VOZ] ? VOZ : "daniel"}`;
// Flash: o modelo mais rápido (resposta em menos de meio segundo) e que gasta metade dos créditos.
const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5";
// Outras boas em pt-BR: pt-BR-FranciscaNeural, pt-BR-ThalitaMultilingualNeural.
// JARVIS_VOICE=navegador desliga a voz da Microsoft.
const EDGE_VOICE = process.env.JARVIS_VOICE || "pt-BR-AntonioNeural";
const EDGE_ON = EDGE_VOICE !== "navegador";
// Azure Speech (Microsoft oficial): plano grátis F0 com 500 mil caracteres por mês (umas 9 horas de
// fala), sem cair como o serviço não oficial. Pede AZURE_SPEECH_KEY e AZURE_SPEECH_REGION.
const AZURE_KEY = process.env.AZURE_SPEECH_KEY || "";
const AZURE_REGION = (process.env.AZURE_SPEECH_REGION || "brazilsouth").trim().toLowerCase();
const AZURE_VOICE = process.env.AZURE_VOZ || "pt-BR-AntonioNeural";

export const VOICE_LABEL = [ELEVEN_KEY && ELEVEN_NAME, AZURE_KEY && `Azure ${AZURE_VOICE}`, EDGE_ON && `Microsoft ${EDGE_VOICE}`, "voz do navegador"]
  .filter(Boolean)
  .join(" → ");
export const SERVER_VOICE = Boolean(ELEVEN_KEY || AZURE_KEY) || EDGE_ON;

// Modo Ultron: outra voz da ElevenLabs (grave e rouca) e as vozes da Microsoft mais graves.
// No navegador ainda passa por um efeito metálico (voice.js).
const ULTRON_VOICE = process.env.ULTRON_VOICE_ID || "N2lVS1w4EtoT3dr4eOWO"; // Callum: intensa, rouca
const PERSONAS = {
  jarvis: { eleven: ELEVEN_VOICE, settings: { stability: 0.6, similarity_boost: 0.8, speed: 1.05 }, pitch: "+0%" },
  ultron: { eleven: ULTRON_VOICE, settings: { stability: 0.35, similarity_boost: 0.85, style: 0.4, speed: 1.0 }, pitch: "-18%" },
};

// Depois de uma falha, pula aquela voz por um tempo em vez de esperar ela falhar de novo.
const downUntil = { eleven: 0, azure: 0, edge: 0 };
const isDown = (k) => Date.now() < downUntil[k];
const markDown = (k, ms) => (downUntil[k] = Date.now() + ms);

export async function elevenLabs(text, tentativa = 0, persona = PERSONAS.jarvis) {
  let res;
  try {
    res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${persona.eleven}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: ELEVEN_MODEL,
        language_code: "pt",
        voice_settings: persona.settings,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error(`  ElevenLabs: ${motivoRede(err)}`);
    markDown("eleven", 15_000); // falha de rede costuma passar rápido
    throw new Error(`Não consegui falar com a ElevenLabs: ${motivoRede(err)}.`);
  }
  if (!res.ok) {
    const body = await res.text();
    // 429: muitas frases pedidas ao mesmo tempo (o plano grátis aceita poucas). Espera um
    // pouquinho e tenta de novo, em vez de trocar de voz no meio da resposta.
    if (res.status === 429 && !/quota/i.test(body) && tentativa < 3) {
      await new Promise((r) => setTimeout(r, 350 * (tentativa + 1)));
      return elevenLabs(text, tentativa + 1, persona);
    }
    console.error(`  ElevenLabs ${res.status}: ${body.slice(0, 300)}`);
    // Sem créditos ou chave inválida: não adianta tentar de novo tão cedo.
    markDown("eleven", res.status === 401 || res.status === 402 || /quota/i.test(body) ? 30 * 60_000 : 60_000);
    throw new Error(explainEleven(res.status, body));
  }
  return Buffer.from(await res.arrayBuffer());
}

// Motivo da falha em português, para aparecer na tela do Jarvis.
function explainEleven(status, body) {
  let code = "";
  try {
    code = JSON.parse(body)?.detail?.status || "";
  } catch {}
  const msgs = {
    missing_permissions: "A chave da ElevenLabs está sem permissão de Text to Speech. No site da ElevenLabs, em API Keys, edite a chave e libere Text to Speech.",
    invalid_api_key: "A chave da ElevenLabs é inválida. Cole a chave de novo em Ajustes.",
    api_key_id_used_as_api_key:
      "O que está salvo é o ID da chave da ElevenLabs, não a chave. Crie uma chave nova no site (API Keys), copie a chave inteira que começa com sk_ (ela só aparece uma vez) e cole em Ajustes.",
    quota_exceeded: "Os créditos grátis da ElevenLabs deste mês acabaram.",
    detected_unusual_activity: "A ElevenLabs bloqueou o plano grátis desta conta por atividade incomum (VPN, por exemplo).",
    voice_not_found: "A voz escolhida não existe na sua conta da ElevenLabs.",
    paid_plan_required: "Essa voz exige plano pago na ElevenLabs.",
  };
  if (msgs[code]) return msgs[code];
  if (status === 401) return "A ElevenLabs recusou a chave (erro 401). Confira se ela está certa e com permissão de Text to Speech.";
  if (status === 402) return "A ElevenLabs pediu plano pago para essa voz.";
  return `A ElevenLabs respondeu com erro ${status}${code ? ` (${code})` : ""}.`;
}

export async function azureTts(text, persona = PERSONAS.jarvis) {
  const ssml = `<speak version="1.0" xml:lang="pt-BR"><voice name="${AZURE_VOICE}"><prosody rate="+8%" pitch="${persona.pitch}">${escapeXml(text)}</prosody></voice></speak>`;
  let res;
  try {
    res = await fetch(`https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": AZURE_KEY,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
        "User-Agent": "jarvis",
      },
      body: ssml,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error(`  Azure: ${motivoRede(err)}`);
    markDown("azure", 15_000);
    throw new Error(`Não consegui falar com a Azure: ${motivoRede(err)}.`);
  }
  if (!res.ok) {
    console.error(`  Azure ${res.status}: ${(await res.text()).slice(0, 200)}`);
    markDown("azure", res.status === 401 || res.status === 403 ? 30 * 60_000 : 60_000);
    if (res.status === 401) throw new Error("A Azure recusou a chave. Confira AZURE_SPEECH_KEY e a região (AZURE_SPEECH_REGION).");
    if (res.status === 429) throw new Error("A Azure pediu para ir mais devagar (limite do plano grátis).");
    throw new Error(`A Azure respondeu com erro ${res.status}.`);
  }
  return Buffer.from(await res.arrayBuffer());
}

let edge = null; // conexão reaproveitada entre frases

const escapeXml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function edgeTts(text, persona = PERSONAS.jarvis) {
  try {
    if (!edge) {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(EDGE_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      edge = tts;
    }
    const { audioStream } = edge.toStream(escapeXml(text), { rate: "+8%", pitch: persona.pitch });
    const chunks = [];
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("tempo esgotado")), 10_000);
      audioStream.on("data", (c) => chunks.push(c));
      audioStream.on("end", () => (clearTimeout(timer), resolve()));
      audioStream.on("error", (e) => (clearTimeout(timer), reject(e)));
    });
    if (!chunks.length) throw new Error("áudio vazio");
    return Buffer.concat(chunks);
  } catch (err) {
    try {
      edge?.close();
    } catch {}
    edge = null;
    // 429: a Microsoft pediu um tempo (muitos pedidos). Insistir só piora.
    markDown("edge", /429/.test(err?.message) ? 3 * 60_000 : 30_000);
    console.error(`  Microsoft: ${motivoRede(err)}`);
    throw new Error(`A voz grátis da Microsoft também não respondeu: ${motivoRede(err)}.`);
  }
}

// Frases curtas que se repetem ("Feito, senhor.") ficam guardadas no disco: saem na hora, sem
// internet e sem gastar créditos. Só guarda a voz principal, para a voz não variar.
const CACHE = dado("voz-cache");
fs.mkdirSync(CACHE, { recursive: true });
const PRINCIPAL = ELEVEN_KEY ? "eleven" : AZURE_KEY ? "azure" : "edge";

function chaveCache(text, persona) {
  const voz = PRINCIPAL === "eleven" ? persona.eleven + ELEVEN_MODEL : PRINCIPAL === "azure" ? AZURE_VOICE : EDGE_VOICE;
  return path.join(CACHE, `${crypto.createHash("sha1").update(`${PRINCIPAL}|${voz}|${persona.pitch}|${text}`).digest("hex")}.mp3`);
}

function lerCache(text, persona) {
  if (text.length > 160) return null;
  try {
    return fs.readFileSync(chaveCache(text, persona));
  } catch {
    return null;
  }
}

function guardarCache(text, persona, audio) {
  if (text.length > 160) return;
  try {
    fs.writeFileSync(chaveCache(text, persona), audio);
    const arquivos = fs.readdirSync(CACHE);
    // No máximo umas 500 frases: apaga as mais antigas.
    if (arquivos.length > 500) {
      arquivos
        .map((f) => ({ f, t: fs.statSync(path.join(CACHE, f)).mtimeMs }))
        .sort((a, b) => a.t - b.t)
        .slice(0, 100)
        .forEach(({ f }) => fs.rmSync(path.join(CACHE, f), { force: true }));
    }
  } catch {}
}

export async function synthesize(text, nomePersona = "jarvis") {
  text = text.slice(0, 2000);
  const persona = PERSONAS[nomePersona] || PERSONAS.jarvis;
  const nomeVoz = PRINCIPAL === "eleven" ? ELEVEN_NAME : PRINCIPAL === "azure" ? "Azure" : "Microsoft";
  const salvo = lerCache(text, persona);
  if (salvo) return { audio: salvo, voice: nomeVoz };
  const errors = [];
  if (ELEVEN_KEY && !isDown("eleven")) {
    try {
      const audio = await elevenLabs(text, 0, persona);
      guardarCache(text, persona, audio);
      return { audio, voice: ELEVEN_NAME };
    } catch (err) {
      errors.push(err.message);
    }
  }
  if (AZURE_KEY && !isDown("azure")) {
    try {
      const audio = await azureTts(text, persona);
      if (PRINCIPAL === "azure") guardarCache(text, persona, audio);
      return { audio, voice: "Azure" };
    } catch (err) {
      errors.push(err.message);
    }
  }
  if (EDGE_ON && !isDown("edge")) {
    try {
      const audio = await edgeTts(text, persona);
      if (PRINCIPAL === "edge") guardarCache(text, persona, audio);
      return { audio, voice: "Microsoft" };
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw new Error(errors.join(" ") || "As vozes do servidor estão em pausa depois de falhar; tento de novo em alguns minutos.");
}
