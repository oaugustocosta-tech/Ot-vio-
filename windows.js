// Roda os scripts do PowerShell da pasta windows/ (cada ação do Windows fica num arquivo
// legível, em vez de comandos montados aqui dentro).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFile } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const ps = (nome, args) => ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(here, "windows", nome), ...args];

// Espera terminar; devolve a saída do script.
export function runPs(nome, args = [], timeout = 20_000) {
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ps(nome, args), { windowsHide: true, timeout, maxBuffer: 8 << 20 }, (err, out) =>
      err ? reject(err) : resolve(out),
    );
  });
}

// Deixa rodando (para o LED, que fica recebendo comandos).
export function spawnPs(nome, args = []) {
  return spawn("powershell.exe", ps(nome, args), { windowsHide: true });
}
