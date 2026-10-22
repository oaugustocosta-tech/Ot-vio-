// Voz do Ultron gerada no servidor, devolvida como MP3.
// - Com ELEVENLABS_API_KEY: ElevenLabs.
// - Sem chave: vozes neurais da Microsoft (as mesmas da "Leitura em voz alta" do Edge), grátis.
//   Esse serviço não é uma API oficial; se falhar, o navegador usa a voz dele.
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY || "";
// "Adam" — voz masculina da biblioteca padrão da ElevenLabs. Troque por outra no .env.
const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB";
// Outras boas em pt-BR: pt-BR-FranciscaNeural, pt-BR-ThalitaMultilingualNeural.
// ULTRON_VOICE=navegador desliga a voz do servidor.
const EDGE_VOICE = process.env.ULTRON_VOICE || "pt-BR-AntonioNeural";

export const VOICE_LABEL = ELEVEN_KEY ? "ElevenLabs" : EDGE_VOICE === "navegador" ? "voz do navegador" : `Microsoft ${EDGE_VOICE}`;
export const SERVER_VOICE = Boolean(ELEVEN_KEY) || EDGE_VOICE !== "navegador";

async function elevenLabs(text) {
  const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2 },
    }),
  });
  if (!upstream.ok) throw new Error(`ElevenLabs ${upstream.status}: ${await upstream.text()}`);
  return Buffer.from(await upstream.arrayBuffer());
}

let edge = null; // conexão reaproveitada entre frases

const escapeXml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function edgeOnce(text) {
  if (!edge) {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(EDGE_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    edge = tts;
  }
  const { audioStream } = edge.toStream(escapeXml(text), { rate: "+8%" });
  const chunks = [];
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("tempo esgotado")), 8_000);
    audioStream.on("data", (c) => chunks.push(c));
    audioStream.on("end", () => (clearTimeout(timer), resolve()));
    audioStream.on("error", (e) => (clearTimeout(timer), reject(e)));
  });
  if (!chunks.length) throw new Error("áudio vazio");
  return Buffer.concat(chunks);
}

let edgeDownUntil = 0; // depois de falhar, deixa a voz do navegador assumir por um tempo

async function edgeTts(text) {
  if (Date.now() < edgeDownUntil) throw new Error("voz Microsoft indisponível no momento");
  try {
    return await edgeOnce(text);
  } catch (err) {
    // A conexão pode ter caído: abre outra e tenta uma vez mais.
    try {
      edge?.close();
    } catch {}
    edge = null;
    console.warn("  Voz Microsoft falhou, tentando de novo:", err.message);
    try {
      return await edgeOnce(text);
    } catch (err2) {
      edgeDownUntil = Date.now() + 2 * 60_000;
      throw err2;
    }
  }
}

export async function synthesize(text) {
  text = text.slice(0, 2000);
  return ELEVEN_KEY ? elevenLabs(text) : edgeTts(text);
}
