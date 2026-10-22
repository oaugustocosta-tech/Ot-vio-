// Spotify: toca músicas e controla o player em qualquer aparelho da conta (o PC, o celular ou
// uma caixinha Echo da Alexa, que aparece no Spotify como aparelho). Precisa de Spotify Premium.
// Conexão pelo jeito oficial (OAuth com PKCE): o usuário cria um app grátis no painel de
// desenvolvedor do Spotify, cola o Client ID na tela Modos e clica em Conectar.
import fs from "node:fs";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { dado } from "./dados.js";
import { normalize } from "./apps.js";

const ARQUIVO = dado("spotify.json");
const PORT = Number(process.env.PORT) || 3000;
// O Spotify só aceita endereço de retorno local com o IP 127.0.0.1 (não "localhost").
export const REDIRECT = `http://127.0.0.1:${PORT}/spotify/callback`;
const SCOPES = "user-read-playback-state user-modify-playback-state";

function load() {
  try {
    return JSON.parse(fs.readFileSync(ARQUIVO, "utf8"));
  } catch {
    return {};
  }
}
function save(data) {
  fs.writeFileSync(ARQUIVO, JSON.stringify(data, null, 2));
}

export function status() {
  const d = load();
  return { configurado: Boolean(d.clientId), conectado: Boolean(d.refreshToken), redirect: REDIRECT };
}

export function setClientId(id) {
  id = String(id || "").trim();
  if (!/^[0-9a-f]{32}$/i.test(id)) throw new Error("Client ID inválido: são 32 letras e números, copiados do painel do Spotify.");
  save({ clientId: id }); // trocar o app desconecta a conta antiga
}

const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const pending = new Map(); // state -> verifier

export function loginUrl() {
  const { clientId } = load();
  if (!clientId) throw new Error("Falta o Client ID do Spotify.");
  const verifier = b64url(crypto.randomBytes(48));
  const state = b64url(crypto.randomBytes(16));
  pending.set(state, verifier);
  const q = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: REDIRECT,
    code_challenge_method: "S256",
    code_challenge: b64url(crypto.createHash("sha256").update(verifier).digest()),
    scope: SCOPES,
    state,
  });
  return `https://accounts.spotify.com/authorize?${q}`;
}

async function tokenRequest(params) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error_description || body.error || `Spotify ${res.status}`);
  return body;
}

function keepTokens(d, t) {
  d.accessToken = t.access_token;
  d.expiresAt = Date.now() + (t.expires_in - 60) * 1000;
  if (t.refresh_token) d.refreshToken = t.refresh_token;
  save(d);
}

export async function finishLogin(code, state) {
  const verifier = pending.get(state);
  pending.delete(state);
  if (!verifier) throw new Error("Pedido de conexão expirado. Clique em Conectar de novo.");
  const d = load();
  keepTokens(d, await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: d.clientId, code_verifier: verifier }));
}

async function accessToken(force = false) {
  const d = load();
  if (!d.refreshToken) throw new Error("O Spotify ainda não está conectado. Conecte na tela Modos do Jarvis.");
  if (!force && d.accessToken && Date.now() < d.expiresAt) return d.accessToken;
  keepTokens(d, await tokenRequest({ grant_type: "refresh_token", refresh_token: d.refreshToken, client_id: d.clientId }));
  return d.accessToken;
}

async function api(method, route, body, retry = true) {
  const res = await fetch(`https://api.spotify.com/v1${route}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(body && { "Content-Type": "application/json" }) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 401 && retry) {
    await accessToken(true);
    return api(method, route, body, false);
  }
  if (res.status === 204 || res.status === 202) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || `erro ${res.status}`;
    if (res.status === 403 && /premium/i.test(msg)) throw new Error("O Spotify só deixa controlar com conta Premium.");
    if (res.status === 404) throw new Error("Nenhum aparelho do Spotify ativo. Abra o Spotify no PC ou chame a Alexa uma vez.");
    throw new Error(`Spotify: ${msg}`);
  }
  return data;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Escolhe o aparelho: o que ele pediu ("alexa", "echo", "celular", "pc"), o que já está tocando,
// o computador, ou o primeiro que achar. Sem nenhum, abre o Spotify do PC e espera ele aparecer.
async function pickDevice(pedido) {
  let devices = (await api("GET", "/me/player/devices"))?.devices || [];
  if (!devices.length && process.platform === "win32") {
    spawn("explorer.exe", ["spotify:"], { detached: true, stdio: "ignore" }).unref();
    for (let i = 0; i < 8 && !devices.length; i++) {
      await wait(1000);
      devices = (await api("GET", "/me/player/devices"))?.devices || [];
    }
  }
  if (!devices.length) throw new Error("Nenhum aparelho do Spotify encontrado. Abra o Spotify no PC ou no celular.");
  const p = normalize(pedido);
  if (p) {
    const alvo = /alexa|echo/.test(p)
      ? devices.find((d) => /echo|alexa/i.test(d.name) || d.type === "Speaker")
      : /pc|computador|notebook/.test(p)
        ? devices.find((d) => d.type === "Computer")
        : /celular|telefone/.test(p)
          ? devices.find((d) => d.type === "Smartphone")
          : devices.find((d) => normalize(d.name).includes(p));
    if (!alvo) throw new Error(`Não achei "${pedido}" no Spotify. Aparelhos: ${devices.map((d) => d.name).join(", ")}.`);
    return alvo;
  }
  return devices.find((d) => d.is_active) || devices.find((d) => d.type === "Computer") || devices[0];
}

const TIPOS = { musica: "track", artista: "artist", playlist: "playlist", album: "album" };

export async function play({ busca, tipo = "musica", aparelho }) {
  const type = TIPOS[tipo] || "track";
  const found = await api("GET", `/search?${new URLSearchParams({ q: String(busca || ""), type, limit: "5" })}`);
  const item = found?.[`${type}s`]?.items?.filter(Boolean)[0];
  if (!item) throw new Error(`Não achei "${busca}" no Spotify.`);
  const device = await pickDevice(aparelho);
  const body = type === "track" ? { uris: [item.uri] } : { context_uri: item.uri };
  await api("PUT", `/me/player/play?device_id=${encodeURIComponent(device.id)}`, body);
  const quem = type === "track" ? `${item.name}, de ${item.artists.map((a) => a.name).join(", ")}` : item.name;
  return `Tocando ${quem} em ${device.name}.`;
}

export async function control({ acao, valor, aparelho }) {
  const device = aparelho || acao === "transferir" ? await pickDevice(aparelho) : null;
  if (acao === "transferir") {
    await api("PUT", "/me/player", { device_ids: [device.id], play: true });
    return `Música passada para ${device.name}.`;
  }
  const q = (extra = {}) => `?${new URLSearchParams({ ...extra, ...(device && { device_id: device.id }) })}`;
  if (acao === "pausar") await api("PUT", `/me/player/pause${q()}`);
  else if (acao === "continuar") await api("PUT", `/me/player/play${q()}`);
  else if (acao === "proxima") await api("POST", `/me/player/next${q()}`);
  else if (acao === "anterior") await api("POST", `/me/player/previous${q()}`);
  else if (acao === "volume") {
    const v = Math.round(Number(valor));
    if (!Number.isFinite(v)) throw new Error("Diga o volume de 0 a 100.");
    await api("PUT", `/me/player/volume${q({ volume_percent: String(Math.max(0, Math.min(100, v))) })}`);
  } else throw new Error(`Ação desconhecida: ${acao}`);
  return "Feito.";
}
