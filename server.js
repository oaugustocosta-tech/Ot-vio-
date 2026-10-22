import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chat, describeError, BRAIN_LABEL, BRAIN_SHORT, NAME } from "./brain.js";
import { synthesize, SERVER_VOICE, VOICE_LABEL } from "./speech.js";
import { rodarRotina } from "./rotina.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// URL prefix -> directory on disk.
const STATIC_ROOTS = [["/", path.join(here, "public/")]];

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

  // Cliente desconectou antes do fim: para de gerar.
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) controller.abort();
  });

  try {
    await chat(history, send, controller.signal);
    send("done", {});
  } catch (err) {
    if (!controller.signal.aborted) {
      console.error("Erro no cérebro:", err);
      send("error", describeError(err));
    }
  } finally {
    res.end();
  }
}

async function handleTts(req, res) {
  if (!SERVER_VOICE) {
    res.writeHead(404).end();
    return;
  }
  const { text } = await readJson(req, 20_000);
  if (typeof text !== "string" || !text.trim()) {
    res.writeHead(400).end();
    return;
  }
  try {
    const { audio, voice } = await synthesize(text);
    res.writeHead(200, { "Content-Type": "audio/mpeg", "X-Jarvis-Voice": voice });
    res.end(audio);
  } catch (err) {
    // O navegador cai para a voz dele quando recebe erro aqui.
    console.error("Voz:", err.message);
    res.writeHead(502).end();
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/chat") return await handleChat(req, res);
    if (req.method === "POST" && req.url === "/api/tts") return await handleTts(req, res);
    if (req.method === "POST" && req.url === "/api/rotina") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ passos: rodarRotina() }));
      return;
    }
    if (req.method === "GET" && req.url === "/api/config") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ neuralVoice: SERVER_VOICE, brain: BRAIN_SHORT, name: NAME }));
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
  console.log(`\n  JARVIS online → http://localhost:${PORT}`);
  console.log(`  Cérebro: ${BRAIN_LABEL}`);
  console.log(`  Voz: ${VOICE_LABEL}\n`);
});
