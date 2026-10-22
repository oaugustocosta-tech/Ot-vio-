// Programas instalados no Windows, do jeito que aparecem no menu Iniciar (Get-StartApps).
// Cobre programas comuns e os da Microsoft Store. Cada um tem um nome e um AppID que abre ele.
import { execFile, spawn } from "node:child_process";

const WINDOWS = process.platform === "win32";
let cache = null;
let cacheAt = 0;

export const normalize = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export function listStartApps() {
  if (!WINDOWS) return Promise.resolve([]);
  if (cache && Date.now() - cacheAt < 10 * 60_000) return Promise.resolve(cache);
  const script =
    "[Console]::OutputEncoding = [Text.Encoding]::UTF8; @(Get-StartApps | Select-Object Name, AppID) | ConvertTo-Json -Compress";
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true, timeout: 20_000, maxBuffer: 8 << 20 }, (err, out) => {
      if (err) return resolve(cache || []);
      try {
        const list = JSON.parse(out || "[]");
        cache = (Array.isArray(list) ? list : [list])
          .filter((a) => a?.Name && a?.AppID && !/uninstall|desinstal/i.test(a.Name))
          .map((a) => ({ name: a.Name, id: a.AppID }))
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        cacheAt = Date.now();
        resolve(cache);
      } catch {
        resolve(cache || []);
      }
    });
  });
}

// Acha um programa pelo nome falado: igual, começa com, contém, ou tem todas as palavras.
export async function findStartApp(nome) {
  const q = normalize(nome);
  if (!q) return null;
  const apps = await listStartApps();
  const words = q.split(" ");
  const tests = [
    (n) => n === q,
    (n) => n.startsWith(q),
    (n) => n.includes(q),
    (n) => words.every((w) => n.includes(w)),
  ];
  for (const test of tests) {
    const hit = apps.find((a) => test(normalize(a.name)));
    if (hit) return hit;
  }
  return null;
}

export const validAppId = (id) => typeof id === "string" && id.length > 0 && id.length < 400 && !/["\r\n]/.test(id);

export function openApp(id) {
  if (!WINDOWS) throw new Error("Essa ação só funciona no Windows.");
  if (!validAppId(id)) throw new Error("Programa inválido.");
  return new Promise((resolve, reject) => {
    const child = spawn("explorer.exe", [`shell:AppsFolder\\${id}`], { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", reject);
    child.unref();
    setTimeout(resolve, 150);
  });
}
