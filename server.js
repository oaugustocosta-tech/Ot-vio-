import { DADOS, dado } from "./dados.js"; // primeiro: carrega as chaves do .env
import "./rede.js";
import http from "node:http";
import fs from "node:fs";
import { runPs } from "./windows.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chat, describeError, BRAIN_LABEL, BRAIN_SHORT, NAME } from "./brain.js";
import { synthesize, SERVER_VOICE, VOICE_LABEL } from "./speech.js";
import { rodarRotina } from "./rotina.js";
import { loadModes, saveModes } from "./modos.js";
import { listStartApps } from "./apps.js";
import { PROGRAMAS, FECHAVEIS, runMode, runTool, escreverTexto } from "./tools.js";
import { CORES } from "./led.js";
import * as spotify from "./spotify.js";
import { diagnostico } from "./diagnostico.js";
import { lerChaves, salvarChaves, reiniciar } from "./chaves.js";

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
    sendJson(res, 502, { error: err.message });
  }
}

// Só aceita pedidos de alteração vindos da própria tela do Jarvis. Sem isso, qualquer site
// aberto no navegador poderia mandar o Jarvis agir (os navegadores não deixam outro site
// mandar JSON sem pedir permissão antes, e essa permissão o servidor nunca dá).
function fromJarvis(req) {
  const origin = req.headers.origin;
  const own = !origin || origin === `http://localhost:${PORT}` || origin === `http://127.0.0.1:${PORT}`;
  return own && /^application\/json\b/i.test(req.headers["content-type"] || "");
}

const sendJson = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};

async function handleModes(req, res) {
  if (req.method === "GET") {
    return sendJson(res, 200, { modos: loadModes(), programas: Object.keys(PROGRAMAS), fechaveis: Object.keys(FECHAVEIS), cores: Object.keys(CORES) });
  }
  const { modos } = await readJson(req);
  const instalados = new Set((await listStartApps()).map((a) => a.id));
  try {
    sendJson(res, 200, { modos: saveModes(modos, { fechaveis: new Set(Object.keys(FECHAVEIS)), conhecidos: new Set(Object.keys(PROGRAMAS)), instalados, cores: new Set(Object.keys(CORES)) }) });
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
}

// Se o atalho acabou de atualizar o Jarvis (atualizar.js), avisa uma vez na tela.
let novidadeLida = null;
function novidade() {
  if (novidadeLida === null) {
    try {
      novidadeLida = JSON.parse(fs.readFileSync(dado("atualizado.json"), "utf8"));
      fs.rmSync(dado("atualizado.json"));
    } catch {
      novidadeLida = false;
    }
  }
  return novidadeLida || null;
}

// "Jarvis, desligar": fecha a janela dele no Edge (o perfil JarvisEdge) e encerra o servidor.
function desligar() {
  console.log("  Desligando a pedido do usuário.");
  if (process.platform === "win32") {
    runPs("fechar-janela.ps1", [], 8000).finally(() => process.exit(0));
  } else {
    setTimeout(() => process.exit(0), 300);
  }
}

// Página simples que aparece depois de conectar o Spotify.
function spotifyPage(res, ok, text) {
  res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
  const safe = String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  res.end(`<!doctype html><meta charset="utf-8"><title>Jarvis</title><body style="background:#050302;color:#ffe9cf;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0"><p>${safe}</p>`);
}

async function handleSpotify(req, res, url) {
  if (url.pathname === "/api/spotify") {
    if (req.method === "POST") {
      try {
        spotify.setClientId((await readJson(req)).clientId);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
    return sendJson(res, 200, spotify.status());
  }
  if (url.pathname === "/spotify/login") {
    try {
      res.writeHead(302, { Location: spotify.loginUrl() }).end();
    } catch (err) {
      spotifyPage(res, false, err.message);
    }
    return;
  }
  // /spotify/callback
  const error = url.searchParams.get("error");
  if (error) return spotifyPage(res, false, `O Spotify recusou a conexão (${error}).`);
  try {
    await spotify.finishLogin(url.searchParams.get("code"), url.searchParams.get("state"));
    spotifyPage(res, true, "Spotify conectado! Pode fechar esta janela e dizer: Jarvis, toca alguma coisa.");
  } catch (err) {
    spotifyPage(res, false, err.message);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (/^\/(api\/spotify|spotify\/(login|callback))$/.test(url.pathname) && (req.method === "GET" || url.pathname === "/api/spotify")) {
      if (req.method === "POST" && !fromJarvis(req)) return sendJson(res, 403, { error: "Pedido recusado." });
      return await handleSpotify(req, res, url);
    }
    if (req.method === "POST" && !fromJarvis(req)) return sendJson(res, 403, { error: "Pedido recusado." });
    if (req.url === "/api/modos" && (req.method === "GET" || req.method === "POST")) return await handleModes(req, res);
    if (req.url === "/api/chaves" && req.method === "GET") return sendJson(res, 200, lerChaves());
    if (req.url === "/api/chaves" && req.method === "POST") {
      try {
        salvarChaves(await readJson(req));
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
      sendJson(res, 200, { ok: true });
      return reiniciar();
    }
    if (req.method === "GET" && req.url === "/api/diagnostico") return sendJson(res, 200, await diagnostico());
    if (req.method === "GET" && req.url === "/api/apps") return sendJson(res, 200, await listStartApps());
    if (req.method === "POST" && req.url === "/api/modos/testar") {
      const { nome } = await readJson(req);
      const modo = loadModes().find((m) => m.nome === nome);
      if (!modo) return sendJson(res, 404, { error: "Modo não encontrado." });
      return sendJson(res, 200, { ok: true, texto: await runMode(modo) });
    }
    if (req.method === "POST" && req.url === "/api/escrever") {
      // Modo ditado: cada frase falada chega aqui e é colada na janela escolhida.
      const { texto, janela } = await readJson(req, 20_000);
      try {
        return sendJson(res, 200, await escreverTexto(texto, { janela }));
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }
    if (req.method === "POST" && req.url === "/api/janela-jarvis") {
      // "Jarvis, se esconde" / "Jarvis, aparece": direto, sem passar pelo cérebro.
      const { acao } = await readJson(req);
      const r = await runTool("janela_jarvis", { acao });
      return sendJson(res, r.ok ? 200 : 400, r.ok ? { ok: true } : { error: r.text });
    }
    if (req.method === "POST" && req.url === "/api/chat") return await handleChat(req, res);
    if (req.method === "POST" && req.url === "/api/tts") return await handleTts(req, res);
    if (req.method === "POST" && req.url === "/api/desligar") {
      sendJson(res, 200, { ok: true });
      return desligar();
    }
    if (req.method === "POST" && req.url === "/api/rotina") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ passos: rodarRotina() }));
      return;
    }
    if (req.method === "GET" && req.url === "/api/config") {
      return sendJson(res, 200, { neuralVoice: SERVER_VOICE, brain: BRAIN_SHORT, name: NAME, atualizado: novidade() });
    }
    if (req.method === "GET") return serveStatic(req, res);
    res.writeHead(405).end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500).end(String(err.message || err));
    else res.end();
  }
});

// Só nesta máquina: ninguém da rede consegue falar com o Jarvis.
// Logo depois de reiniciar (troca de chave), o servidor antigo pode ainda estar soltando a porta.
let tentativasPorta = 0;
server.on("error", (err) => {
  if (err.code !== "EADDRINUSE" || ++tentativasPorta > 20) throw err;
  setTimeout(() => server.listen(PORT, "127.0.0.1"), 250);
});
server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  JARVIS online → http://127.0.0.1:${PORT}`);
  console.log(`  Cérebro: ${BRAIN_LABEL}`);
  console.log(`  Voz: ${VOICE_LABEL}`);
  console.log(`  Seus dados: ${DADOS}\n`);
});
