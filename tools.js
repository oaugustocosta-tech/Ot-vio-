// Ações que o Ultron pode executar no computador.
// Cada ferramenta tem uma descrição (o que a IA lê para decidir quando usar) e uma função `run`.
// Nada aqui roda comando livre: só ações fixas desta lista. Para adicionar um programa,
// inclua uma linha em PROGRAMAS.
import { spawn } from "node:child_process";

const WINDOWS = process.platform === "win32";

// nome falado -> como abrir no Windows. "uri" abre por protocolo (apps da Microsoft Store
// e programas que registram um link), "exe" abre pelo nome do executável.
export const PROGRAMAS = {
  "bloco de notas": { exe: "notepad" },
  calculadora: { uri: "calculator:" },
  explorador: { exe: "explorer" },
  arquivos: { exe: "explorer" },
  configurações: { uri: "ms-settings:" },
  chrome: { exe: "chrome" },
  edge: { exe: "msedge" },
  spotify: { uri: "spotify:" },
  whatsapp: { uri: "whatsapp:" },
  word: { exe: "winword" },
  excel: { exe: "excel" },
  "gerenciador de tarefas": { exe: "taskmgr" },
  paint: { exe: "mspaint" },
  câmera: { uri: "microsoft.windows.camera:" },
};

// Teclas virtuais de mídia do Windows.
const TECLAS = {
  tocar_pausar: 179,
  proxima: 176,
  anterior: 177,
  aumentar_volume: 175,
  diminuir_volume: 174,
  mudo: 173,
};

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", reject);
    child.unref();
    // explorer.exe e cmd costumam sair com código != 0 mesmo quando funcionam; basta ter iniciado.
    setTimeout(resolve, 150);
  });
}

function openTarget(target) {
  if (WINDOWS) return run("explorer.exe", [target]);
  if (process.platform === "darwin") return run("open", [target]);
  return run("xdg-open", [target]);
}

function normalizeUrl(raw) {
  let url = String(raw || "").trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const parsed = new URL(url); // lança erro se for inválida
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("Só abro links da web.");
  return parsed.href;
}

function onlyWindows() {
  if (!WINDOWS) throw new Error("Essa ação só funciona no Windows.");
}

export const TOOLS = [
  {
    name: "abrir_site",
    description: "Abre um site no navegador do computador. Use quando pedirem para abrir uma página, como Google, YouTube, Gmail ou Instagram.",
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "Endereço do site, por exemplo https://www.youtube.com" } },
      required: ["url"],
    },
    async run({ url }) {
      const href = normalizeUrl(url);
      await openTarget(href);
      return `Aberto: ${href}`;
    },
  },
  {
    name: "pesquisar",
    description: "Pesquisa algo no Google e abre os resultados no navegador.",
    parameters: {
      type: "object",
      properties: { termo: { type: "string", description: "O que pesquisar" } },
      required: ["termo"],
    },
    async run({ termo }) {
      const href = `https://www.google.com/search?q=${encodeURIComponent(String(termo || ""))}`;
      await openTarget(href);
      return `Pesquisa aberta para: ${termo}`;
    },
  },
  {
    name: "abrir_programa",
    description: `Abre um programa do computador. Programas disponíveis: ${Object.keys(PROGRAMAS).join(", ")}.`,
    parameters: {
      type: "object",
      properties: { nome: { type: "string", enum: Object.keys(PROGRAMAS) } },
      required: ["nome"],
    },
    async run({ nome }) {
      onlyWindows();
      const prog = PROGRAMAS[String(nome || "").toLowerCase()];
      if (!prog) throw new Error(`Não conheço o programa "${nome}".`);
      if (prog.uri) await run("explorer.exe", [prog.uri]);
      else await run("cmd.exe", ["/c", "start", prog.exe]);
      return `Abrindo ${nome}.`;
    },
  },
  {
    name: "controlar_midia",
    description: "Controla música/vídeo e o volume do computador: tocar ou pausar, próxima, anterior, aumentar ou diminuir volume, mudo.",
    parameters: {
      type: "object",
      properties: {
        acao: { type: "string", enum: Object.keys(TECLAS) },
        vezes: { type: "integer", description: "Para volume: quantos passos (1 a 25). Cada passo é 2%." },
      },
      required: ["acao"],
    },
    async run({ acao, vezes }) {
      onlyWindows();
      const key = TECLAS[acao];
      if (!key) throw new Error(`Ação desconhecida: ${acao}`);
      const n = /volume/.test(acao) ? Math.min(25, Math.max(1, Number(vezes) || 5)) : 1;
      const script = `$s = New-Object -ComObject WScript.Shell; 1..${n} | % { $s.SendKeys([char]${key}) }`;
      await run("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", script]);
      return `Feito: ${acao}${n > 1 ? ` (${n}x)` : ""}.`;
    },
  },
  {
    name: "bloquear_computador",
    description: "Bloqueia a tela do computador (volta para a tela de senha).",
    parameters: { type: "object", properties: {} },
    async run() {
      onlyWindows();
      await run("rundll32.exe", ["user32.dll,LockWorkStation"]);
      return "Computador bloqueado.";
    },
  },
];

export async function runTool(name, input) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { ok: false, text: `Ferramenta desconhecida: ${name}` };
  try {
    console.log(`  ação → ${name}`, JSON.stringify(input));
    return { ok: true, text: await tool.run(input || {}) };
  } catch (err) {
    return { ok: false, text: `Falhou: ${err.message}` };
  }
}
