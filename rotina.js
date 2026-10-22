// Rotina de quando o computador liga: lê rotina.txt e executa linha por linha.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROGRAMAS, FECHAVEIS, runTool } from "./tools.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ARQUIVO = path.join(here, "rotina.txt");
const MODELO = path.join(here, "rotina.exemplo.txt");

function lerPassos() {
  if (!fs.existsSync(ARQUIVO) && fs.existsSync(MODELO)) fs.copyFileSync(MODELO, ARQUIVO);
  if (!fs.existsSync(ARQUIVO)) return [];
  const passos = [];
  for (const linha of fs.readFileSync(ARQUIVO, "utf8").split(/\r?\n/)) {
    const m = linha.trim().match(/^(fechar|abrir)\s+(.+)$/i);
    if (!m) continue;
    const verbo = m[1].toLowerCase();
    const alvo = m[2].trim().toLowerCase();
    if (verbo === "fechar" && FECHAVEIS[alvo]) passos.push(["fechar_programa", { nome: alvo }]);
    else if (verbo === "abrir" && PROGRAMAS[alvo]) passos.push(["abrir_programa", { nome: alvo }]);
    else if (verbo === "abrir" && /\./.test(alvo)) passos.push(["abrir_site", { url: alvo }]);
    else console.warn(`  Rotina: não entendi "${linha.trim()}"`);
  }
  return passos;
}

let jaRodou = false;

// Roda uma vez por vez que o servidor liga. Programas como o Discord costumam abrir alguns
// segundos depois do Windows, então os "fechar" rodam de novo depois de meio minuto.
export function rodarRotina() {
  if (jaRodou) return 0;
  jaRodou = true;
  const passos = lerPassos();
  (async () => {
    for (const [nome, entrada] of passos) await runTool(nome, entrada);
    setTimeout(async () => {
      for (const [nome, entrada] of passos) if (nome === "fechar_programa") await runTool(nome, entrada);
    }, 30_000);
  })();
  return passos.length;
}
