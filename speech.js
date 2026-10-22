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
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}?output_format=mp3_44100_64`, {
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
  if (!res.ok) {
    const body = await res.text();
    // Sem créditos ou chave inválida: não adianta tentar de novo tão cedo.
    markDown("eleven", res.status === 401 || res.status === 402 || /quota/i.test(body) ? 30 * 60_000 : 60_000);
    throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
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
    throw new Error(`Microsoft: ${err.message}`);
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
  throw new Error(errors.join(" | ") || "vozes do servidor em pausa depois de falhar");
}
