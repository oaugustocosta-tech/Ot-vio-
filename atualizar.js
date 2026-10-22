// Atualização automática: o atalho do Jarvis roda este arquivo antes de abrir.
// Se houver versão nova no GitHub, baixa e copia por cima desta pasta. As coisas do usuário
// (chaves, modos, Spotify, rotina) ficam em outra pasta (veja dados.js) e não são tocadas.
// Sem internet ou com qualquer erro, só segue com a versão que já está aqui.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { dado } from "./dados.js";

const REPO = "oaugustocosta-tech/Ot-vio-";
const RAMO = "main";
const here = path.dirname(fileURLToPath(import.meta.url));
// Nunca sobrescreve: as peças instaladas pelo npm e o git de quem programa.
const PULAR = new Set(["node_modules", ".git"]);

function copiar(de, para) {
  for (const item of fs.readdirSync(de, { withFileTypes: true })) {
    if (PULAR.has(item.name)) continue;
    const origem = path.join(de, item.name);
    const destino = path.join(para, item.name);
    if (item.isDirectory()) {
      fs.mkdirSync(destino, { recursive: true });
      copiar(origem, destino);
    } else {
      fs.copyFileSync(origem, destino);
    }
  }
}

const ler = (arquivo) => (fs.existsSync(arquivo) ? fs.readFileSync(arquivo, "utf8") : "");

async function atualizar() {
  // Quem programa (pasta com .git) atualiza pelo git, não por aqui.
  if (fs.existsSync(path.join(here, ".git"))) return;

  const r = await fetch(`https://api.github.com/repos/${REPO}/commits/${RAMO}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "jarvis" },
    signal: AbortSignal.timeout(6_000),
  });
  if (!r.ok) throw new Error(`GitHub respondeu ${r.status}`);
  const { sha, commit } = await r.json();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("versão inválida");
  if (ler(dado("versao.txt")).trim() === sha) return;

  console.log(`Baixando a versão ${sha.slice(0, 7)}...`);
  const zip = await fetch(`https://codeload.github.com/${REPO}/tar.gz/${sha}`, { signal: AbortSignal.timeout(60_000) });
  if (!zip.ok) throw new Error(`download falhou (${zip.status})`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-"));
  try {
    const arquivo = path.join(tmp, "jarvis.tar.gz");
    fs.writeFileSync(arquivo, Buffer.from(await zip.arrayBuffer()));
    // O tar já vem no Windows 10 e 11.
    execFileSync("tar", ["-xzf", arquivo, "-C", tmp], { windowsHide: true });
    const pasta = fs.readdirSync(tmp, { withFileTypes: true }).find((d) => d.isDirectory());
    if (!pasta) throw new Error("download vazio");
    const nova = path.join(tmp, pasta.name);

    const pecas = () => ler(path.join(here, "package.json")) + ler(path.join(here, "package-lock.json"));
    const pecasAntes = pecas();
    copiar(nova, here);
    if (pecas() !== pecasAntes) {
      console.log("Instalando peças novas...");
      execFileSync("npm", ["install", "--omit=dev", "--no-fund", "--no-audit"], { cwd: here, shell: true, windowsHide: true, stdio: "inherit" });
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  fs.writeFileSync(dado("versao.txt"), sha);
  // O servidor lê isto ao abrir e o Jarvis avisa que foi atualizado.
  // Num "Merge pull request #N", o título do pedido vem nas linhas de baixo.
  const linhas = String(commit?.message || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const resumo = (/^Merge pull request/.test(linhas[0] || "") && linhas[1] ? linhas[1] : linhas[0] || "").slice(0, 200);
  fs.writeFileSync(dado("atualizado.json"), JSON.stringify({ versao: sha.slice(0, 7), resumo }));
  console.log(`Atualizado: ${resumo}`);
}

try {
  await atualizar();
} catch (err) {
  console.error(`Sem atualização agora: ${err.message}`);
}
