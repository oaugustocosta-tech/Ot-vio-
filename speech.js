// Voz do Jarvis gerada no servidor, devolvida como MP3. Tenta, nesta ordem:
// 1. ElevenLabs (se houver ELEVENLABS_API_KEY): a mais realista. O plano grátis dá ~20 minutos
//    de fala por mês com o modelo Flash; quando acabar, passa sozinho para a próxima.
// 2. Vozes neurais da Microsoft (as do "Ler em voz alta" do Edge), grátis, sem chave.
//    Não é uma API oficial.
// Se nada funcionar, o servidor responde erro e o navegador fala com a voz dele.
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

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

export const VOICE_LABEL = [ELEVEN_KEY && ELEVEN_NAME, EDGE_ON && `Microsoft ${EDGE_VOICE}`, "voz do navegador"]
  .filter(Boolean)
  .join(" → ");
export const SERVER_VOICE = Boolean(ELEVEN_KEY) || EDGE_ON;

// Depois de uma falha, pula aquela voz por um tempo em vez de esperar ela falhar de novo.
const downUntil = { eleven: 0, edge: 0 };
const isDown = (k) => Date.now() < downUntil[k];
const markDown = (k, ms) => (downUntil[k] = Date.now() + ms);

async function elevenLabs(text) {
  let res;
  try {
    res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: ELEVEN_MODEL,
        language_code: "pt",
        voice_settings: { stability: 0.6, similarity_boost: 0.8, speed: 1.05 },
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    console.error(`  ElevenLabs: ${err.message}`);
    markDown("eleven", 60_000);
    throw new Error("Não consegui falar com a ElevenLabs (internet lenta ou fora do ar).");
  }
  if (!res.ok) {
    const body = await res.text();
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
    invalid_api_key: "A chave da ElevenLabs é inválida. Rode o instalar.bat e cole a chave de novo.",
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

let edge = null; // conexão reaproveitada entre frases

const escapeXml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function edgeTts(text) {
  try {
    if (!edge) {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(EDGE_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      edge = tts;
    }
    const { audioStream } = edge.toStream(escapeXml(text), { rate: "+8%" });
    const chunks = [];
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("tempo esgotado")), 5_000);
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
    markDown("edge", 2 * 60_000);
    console.error(`  Microsoft: ${err.message}`);
    throw new Error("A voz grátis da Microsoft também não respondeu.");
  }
}

export async function synthesize(text) {
  text = text.slice(0, 2000);
  const errors = [];
  if (ELEVEN_KEY && !isDown("eleven")) {
    try {
      return { audio: await elevenLabs(text), voice: ELEVEN_NAME };
    } catch (err) {
      errors.push(err.message);
    }
  }
  if (EDGE_ON && !isDown("edge")) {
    try {
      return { audio: await edgeTts(text), voice: "Microsoft" };
    } catch (err) {
      errors.push(err.message);
    }
  }
  throw new Error(errors.join(" ") || "As vozes do servidor estão em pausa depois de falhar; tento de novo em alguns minutos.");
}
