// LED pelo OpenRGB: programa grátis que fala direto com a placa-mãe e as fans, sem o Armoury Crate.
// O OpenRGB fica aberto em segundo plano com o "servidor SDK" ligado (porta 6742, só dentro do PC),
// e o Jarvis manda as cores por esse canal. Se ele estiver instalado mas fechado, o Jarvis abre.
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { DADOS } from "./dados.js";

const PORTA = 6742;
const COUNT = 0;
const DATA = 1;
const NOME = 50;
const UPDATELEDS = 1050;
const CUSTOM = 1100;

// Onde o OpenRGB costuma ficar: instalado pelo instalador oficial ou baixado pelo Jarvis.
export function acharOpenRgb() {
  const fixos = [
    process.env.OPENRGB_EXE,
    path.join(process.env.ProgramFiles || "C:\\Program Files", "OpenRGB", "OpenRGB.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "OpenRGB", "OpenRGB.exe"),
  ];
  for (const f of fixos) if (f && fs.existsSync(f)) return f;
  // O zip traz uma pasta dentro ("OpenRGB Windows 64-bit"): procura até dois níveis.
  const base = path.join(DADOS, "OpenRGB");
  const fila = [[base, 0]];
  while (fila.length) {
    const [dir, nivel] = fila.shift();
    let itens = [];
    try {
      itens = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const it of itens) {
      if (it.isFile() && it.name.toLowerCase() === "openrgb.exe") return path.join(dir, it.name);
      if (it.isDirectory() && nivel < 2) fila.push([path.join(dir, it.name), nivel + 1]);
    }
  }
  return null;
}

class Conexao {
  constructor(sock) {
    this.sock = sock;
    this.buf = Buffer.alloc(0);
    this.esperando = [];
    sock.on("data", (d) => {
      this.buf = Buffer.concat([this.buf, d]);
      this.ler();
    });
    const fim = () => {
      for (const w of this.esperando) w.reject(new Error("o OpenRGB fechou a conexão"));
      this.esperando = [];
    };
    sock.on("close", fim);
    sock.on("error", fim);
  }

  ler() {
    while (this.buf.length >= 16) {
      const tam = this.buf.readUInt32LE(12);
      if (this.buf.length < 16 + tam) return;
      const tipo = this.buf.readUInt32LE(8);
      const corpo = this.buf.subarray(16, 16 + tam);
      this.buf = this.buf.subarray(16 + tam);
      const i = this.esperando.findIndex((w) => w.tipo === tipo);
      if (i >= 0) this.esperando.splice(i, 1)[0].resolve(corpo);
    }
  }

  enviar(aparelho, tipo, corpo = Buffer.alloc(0)) {
    const h = Buffer.alloc(16);
    h.write("ORGB", 0, "ascii");
    h.writeUInt32LE(aparelho, 4);
    h.writeUInt32LE(tipo, 8);
    h.writeUInt32LE(corpo.length, 12);
    this.sock.write(Buffer.concat([h, corpo]));
  }

  pedir(aparelho, tipo, corpo) {
    return new Promise((resolve, reject) => {
      const w = { tipo, resolve, reject };
      this.esperando.push(w);
      this.enviar(aparelho, tipo, corpo);
      setTimeout(() => {
        const i = this.esperando.indexOf(w);
        if (i >= 0) this.esperando.splice(i, 1);
        reject(new Error("o OpenRGB não respondeu"));
      }, 5000);
    });
  }
}

// Lê só o que interessa da descrição de um aparelho (protocolo versão 0): nome e quantos LEDs tem.
export function lerAparelho(b) {
  let p = 4; // tamanho total
  const u16 = () => ((p += 2), b.readUInt16LE(p - 2));
  const u32 = () => ((p += 4), b.readUInt32LE(p - 4));
  const str = () => {
    const n = u16();
    p += n;
    return b.toString("utf8", p - n, p).replace(/\0+$/, "");
  };
  u32(); // tipo
  const nome = str();
  for (let i = 0; i < 4; i++) str(); // descrição, versão, série, local
  const modos = u16();
  u32(); // modo ativo
  for (let m = 0; m < modos; m++) {
    str();
    p += 4 * 9; // valor, flags, velocidades, cores, direção, modo de cor
    const cores = u16();
    p += cores * 4;
  }
  const zonas = u16();
  for (let z = 0; z < zonas; z++) {
    str();
    p += 4 * 4; // tipo, mínimo, máximo, quantidade
    const mapa = u16(); // mapa de matriz (em bytes)
    p += mapa;
  }
  const leds = u16();
  return { nome, leds };
}

let conexao = null;

function conectar() {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: "127.0.0.1", port: PORTA });
    sock.setNoDelay(true);
    const t = setTimeout(() => {
      sock.destroy();
      reject(new Error("o OpenRGB não respondeu"));
    }, 3000);
    sock.once("connect", () => {
      clearTimeout(t);
      const c = new Conexao(sock);
      c.enviar(0, NOME, Buffer.from("Jarvis\0"));
      sock.on("close", () => {
        if (conexao === c) conexao = null;
      });
      resolve(c);
    });
    sock.once("error", (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Conecta; se o OpenRGB estiver instalado mas fechado, abre minimizado com o servidor ligado.
async function obter() {
  if (conexao) return conexao;
  try {
    conexao = await conectar();
    return conexao;
  } catch (err) {
    if (err.code !== "ECONNREFUSED") throw err;
  }
  const exe = process.platform === "win32" ? acharOpenRgb() : null;
  if (!exe) {
    const e = new Error("OpenRGB não instalado");
    e.semOpenRgb = true;
    throw e;
  }
  spawn(exe, ["--server", "--startminimized"], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  // Ele demora alguns segundos para achar as placas antes de abrir o servidor.
  for (let i = 0; i < 40; i++) {
    await espera(500);
    try {
      conexao = await conectar();
      return conexao;
    } catch {}
  }
  throw new Error("abri o OpenRGB, mas o servidor dele não ligou. No OpenRGB, aba SDK Server, clique em Start Server");
}

async function aparelhos(c) {
  const qtd = (await c.pedir(0, COUNT)).readUInt32LE(0);
  const lista = [];
  for (let i = 0; i < qtd; i++) lista.push({ id: i, ...lerAparelho(await c.pedir(i, DATA)) });
  return lista;
}

export async function contarOpenRgb() {
  const lista = (await aparelhos(await obter())).filter((a) => a.leds > 0);
  if (!lista.length) throw new Error("o OpenRGB abriu, mas não achou nenhuma luz. Abra o OpenRGB e veja se ele lista a placa-mãe e as fans");
  return lista;
}

// Pinta todas as luzes de todos os aparelhos com uma cor (hex "RRGGBB").
export async function corOpenRgb(hex) {
  const c = await obter();
  const lista = (await aparelhos(c)).filter((a) => a.leds > 0);
  if (!lista.length) throw new Error("o OpenRGB não achou nenhuma luz");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  let luzes = 0;
  for (const a of lista) {
    c.enviar(a.id, CUSTOM); // modo "direto": aceita cores do Jarvis
    const corpo = Buffer.alloc(6 + a.leds * 4);
    corpo.writeUInt32LE(corpo.length, 0);
    corpo.writeUInt16LE(a.leds, 4);
    for (let i = 0; i < a.leds; i++) corpo.set([r, g, b, 0], 6 + i * 4);
    c.enviar(a.id, UPDATELEDS, corpo);
    luzes += a.leds;
  }
  return { placas: lista.length, luzes };
}
