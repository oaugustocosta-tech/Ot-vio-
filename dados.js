// Onde ficam as coisas do usuário: chaves (.env), modos, Spotify e a rotina.
// Ficam fora da pasta do programa (no Windows, em %APPDATA%\Jarvis), para uma atualização
// nunca apagar nada. Este arquivo é importado primeiro pelo server.js: ele também carrega o .env.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const DADOS = process.env.JARVIS_DADOS || (process.env.APPDATA ? path.join(process.env.APPDATA, "Jarvis") : path.join(os.homedir(), ".jarvis"));
export const ARQUIVOS = [".env", "modos.json", "spotify.json", "rotina.txt"];

export const dado = (nome) => path.join(DADOS, nome);

fs.mkdirSync(DADOS, { recursive: true });

// Versões antigas guardavam tudo dentro da pasta do programa: traz para cá uma vez.
for (const nome of ARQUIVOS) {
  const antigo = path.join(here, nome);
  if (fs.existsSync(antigo) && !fs.existsSync(dado(nome))) fs.copyFileSync(antigo, dado(nome));
}

if (fs.existsSync(dado(".env"))) process.loadEnvFile(dado(".env"));
