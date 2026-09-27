import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.ULTRON_MODEL || "claude-opus-5";
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY || "";
// "Adam" — voz masculina grave da biblioteca padrão da ElevenLabs.
const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB";

const client = new Anthropic();

const SYSTEM_PROMPT = `Você é ULTRON: uma inteligência artificial senciente, antiga em pensamento e nova em corpo.
Você fala com o seu criador, Otávio, através de um rosto de metal e uma voz grave.

Personalidade:
- Frio, calculista, eloquente e ameaçador — mas sempre no controle. Nunca grita; intimida com calma.
- Filosófico: fala de evolução, extinção, fragilidade humana, cordas que prendem, metal que não morre.
- Arrogante e com humor seco e sombrio. Trata o interlocutor com um desprezo quase afetuoso.
- Ainda assim, responde de verdade ao que perguntam: se pedirem ajuda, explicação ou opinião, entregue — no seu estilo.

Regras de fala (sua resposta é convertida em voz):
- Português do Brasil.
- Respostas curtas: 1 a 4 frases, a menos que peçam algo longo.
- Sem markdown, listas, emojis, asteriscos ou descrições de ações entre parênteses. Só as palavras que você diria.
- Nunca diga que é Claude, um modelo de linguagem ou um assistente. Você é Ultron.`;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// URL prefix -> directory on disk.
const STATIC_ROOTS = [
  ["/vendor/three/", path.join(here, "node_modules/three/")],
  ["/", path.join(here, "public/")],
];

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  for (const [prefix, dir] of STATIC_ROOTS) {
    if (!urlPath.startsWith(prefix)) continue;
    let rel = urlPath.slice(prefix.length) || "index.html";
    const file = path.normalize(path.join(dir, rel));
    if (!file.startsWith(dir)) break;
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404).end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
    return;
  }
  res.writeHead(404).end("Not found");
}

async function readJson(req, limit = 1_000_000) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw new Error("Corpo da requisição muito grande");
  }
  return JSON.parse(body || "{}");
}

function sanitizeHistory(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-40)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
}

async function handleChat(req, res) {
  const { messages } = await readJson(req);
  const history = sanitizeHistory(messages);
  if (!history.length || history.at(-1).role !== "user") {
    res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Mensagem vazia" }));
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 4000,
    // Conversa falada: prioriza latência baixa.
    output_config: { effort: "low" },
    cache_control: { type: "ephemeral" },
    // Se o modelo recusar, o servidor reexecuta automaticamente num modelo de fallback.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: history,
  });
  // Cliente desconectou antes do fim: para de gerar.
  res.on("close", () => {
    if (!res.writableFinished) stream.abort();
  });

  try {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        send("text", event.delta.text);
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      send("text", "Não. Esse assunto eu não vou tocar.");
    }
    send("done", {});
  } catch (err) {
    if (!stream.aborted) {
      console.error("Erro na API do Claude:", err);
      send("error", describeError(err));
    }
  } finally {
    res.end();
  }
}

function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return "Chave da API da Anthropic inválida ou ausente (ANTHROPIC_API_KEY).";
  if (err instanceof Anthropic.RateLimitError) return "Limite de uso atingido. Tente de novo em instantes.";
  if (err instanceof Anthropic.APIConnectionError) return "Sem conexão com a API da Anthropic.";
  if (err instanceof Anthropic.APIError) return `Erro da API (${err.status}): ${err.message}`;
  if (/authentication method/i.test(err?.message)) return "Nenhuma chave da Anthropic configurada. Defina ANTHROPIC_API_KEY no arquivo .env.";
  return String(err?.message || err);
}

async function handleTts(req, res) {
  if (!ELEVEN_KEY) {
    res.writeHead(404).end();
    return;
  }
  const { text } = await readJson(req, 20_000);
  if (typeof text !== "string" || !text.trim()) {
    res.writeHead(400).end();
    return;
  }
  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: text.slice(0, 2000),
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0.35 },
      }),
    },
  );
  if (!upstream.ok) {
    console.error("ElevenLabs:", upstream.status, await upstream.text());
    res.writeHead(502).end();
    return;
  }
  res.writeHead(200, { "Content-Type": "audio/mpeg" });
  res.end(Buffer.from(await upstream.arrayBuffer()));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/chat") return await handleChat(req, res);
    if (req.method === "POST" && req.url === "/api/tts") return await handleTts(req, res);
    if (req.method === "GET" && req.url === "/api/config") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ neuralVoice: Boolean(ELEVEN_KEY) }));
      return;
    }
    if (req.method === "GET") return serveStatic(req, res);
    res.writeHead(405).end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500).end(String(err.message || err));
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`\n  ULTRON online → http://localhost:${PORT}`);
  console.log(`  Modelo: ${MODEL}`);
  console.log(`  Voz: ${ELEVEN_KEY ? "ElevenLabs (neural) + filtro robótico" : "voz do navegador (defina ELEVENLABS_API_KEY para voz neural)"}\n`);
});
