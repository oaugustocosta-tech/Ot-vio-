// Chaves e escolhas do .env que dá para mudar pela tela Ajustes, sem abrir o arquivo.
// Depois de salvar, o servidor reinicia sozinho para usar os valores novos.
import fs from "node:fs";
import { spawn } from "node:child_process";
import { dado, AMBIENTE_ORIGINAL } from "./dados.js";

export const EDITAVEIS = {
  GROQ_API_KEY: /^gsk_\w{20,}$/,
  ELEVENLABS_API_KEY: /^(sk_)?\w{20,}$/,
  AZURE_SPEECH_KEY: /^\w{20,}$/,
  AZURE_SPEECH_REGION: /^[a-z0-9]{3,30}$/,
  JARVIS_VOZ: /^(daniel|george|brian|alice|lily)$/,
};
const SECRETAS = new Set(["GROQ_API_KEY", "ELEVENLABS_API_KEY", "AZURE_SPEECH_KEY"]);

// O que a tela mostra: as chaves só como "tem" ou "não tem".
export function lerChaves() {
  const out = {};
  for (const nome of Object.keys(EDITAVEIS)) {
    const v = process.env[nome] || "";
    out[nome] = SECRETAS.has(nome) ? Boolean(v) : v;
  }
  return out;
}

export function salvarChaves(novas) {
  const mudar = {};
  for (const [nome, valor] of Object.entries(novas || {})) {
    if (!(nome in EDITAVEIS)) continue;
    const v = String(valor ?? "").trim();
    if (v && !EDITAVEIS[nome].test(v)) throw new Error(`O valor de ${nome} não parece certo. Confira se copiou inteiro.`);
    mudar[nome] = v;
  }
  if (!Object.keys(mudar).length) throw new Error("Nada para salvar.");
  const arquivo = dado(".env");
  const linhas = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, "utf8").split(/\r?\n/) : [];
  for (const [nome, v] of Object.entries(mudar)) {
    const i = linhas.findIndex((l) => l.startsWith(`${nome}=`));
    if (i >= 0) linhas[i] = `${nome}=${v}`;
    else linhas.push(`${nome}=${v}`);
  }
  fs.writeFileSync(arquivo, linhas.join("\n").replace(/\n*$/, "\n"));
}

// Abre um servidor novo (com as mesmas opções) e fecha este. A tela recarrega em seguida.
export function reiniciar() {
  setTimeout(() => {
    const filho = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
      cwd: process.cwd(),
      detached: true,
      stdio: ["ignore", fs.openSync("jarvis.log", "a"), fs.openSync("jarvis-erros.log", "a")],
      windowsHide: true,
      env: AMBIENTE_ORIGINAL,
    });
    filho.unref();
    process.exit(0);
  }, 300);
}
