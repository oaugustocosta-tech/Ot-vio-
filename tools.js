// Ações que o Jarvis pode executar no computador.
// Cada ferramenta tem uma descrição (o que a IA lê para decidir quando usar) e uma função `run`.
// Nada aqui roda comando livre: só ações fixas desta lista. Para adicionar um programa,
// inclua uma linha em PROGRAMAS.
import { spawn, execFile } from "node:child_process";
import { findStartApp, openApp } from "./apps.js";
import { runPs } from "./windows.js";
import { findMode, loadModes } from "./modos.js";
import * as spotify from "./spotify.js";
import { setLed, CORES } from "./led.js";

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
  telegram: { uri: "tg:" },
  discord: { uri: "discord:" },
  steam: { uri: "steam:" },
  word: { exe: "winword" },
  excel: { exe: "excel" },
  "gerenciador de tarefas": { exe: "taskmgr" },
  paint: { exe: "mspaint" },
  câmera: { uri: "microsoft.windows.camera:" },
};

// nome falado -> processos que "fechar" encerra. O Edge fica de fora de propósito: a janela
// do Jarvis roda nele.
export const FECHAVEIS = {
  discord: ["Discord.exe"],
  spotify: ["Spotify.exe"],
  steam: ["steam.exe"],
  whatsapp: ["WhatsApp.exe", "WhatsApp.Root.exe"],
  telegram: ["Telegram.exe"],
  chrome: ["chrome.exe"],
  word: ["WINWORD.EXE"],
  excel: ["EXCEL.EXE"],
  "bloco de notas": ["notepad.exe"],
  calculadora: ["CalculatorApp.exe"],
  paint: ["mspaint.exe"],
  "epic games": ["EpicGamesLauncher.exe"],
};

// Mostra ou esconde a janela do Jarvis (o título dela é "JARVIS"); ver windows/janela.ps1.
const JANELA = ["mostrar", "esconder"];

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

// Roda e espera terminar; devolve o código de saída.
function runWait(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 10_000 }, (err) => resolve(err ? (err.code ?? 1) : 0));
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
    description: `Abre um programa do computador. Funciona com qualquer programa instalado (pelo nome que aparece no menu Iniciar, como Photoshop, Steam ou Visual Studio Code) e com estes atalhos: ${Object.keys(PROGRAMAS).join(", ")}.`,
    parameters: {
      type: "object",
      properties: { nome: { type: "string", description: "Nome do programa" } },
      required: ["nome"],
    },
    async run({ nome }) {
      onlyWindows();
      return openProgram(nome);
    },
  },
  {
    name: "ativar_modo",
    description: "Ativa um modo que ele criou na tela Modos do Jarvis (por exemplo 'trabalho' ou 'game'): abre e fecha os programas e sites daquele modo de uma vez. Os nomes dos modos criados aparecem junto da mensagem dele.",
    parameters: {
      type: "object",
      properties: { nome: { type: "string", description: "Nome do modo, por exemplo trabalho" } },
      required: ["nome"],
    },
    async run({ nome }) {
      onlyWindows();
      const modo = findMode(nome);
      if (!modo) {
        const nomes = loadModes().map((m) => m.nome);
        throw new Error(nomes.length ? `Não existe o modo "${nome}". Modos criados: ${nomes.join(", ")}.` : "Nenhum modo criado ainda. Ele cria na tela Modos.");
      }
      return runMode(modo);
    },
  },
  {
    name: "fechar_programa",
    description: `Fecha um programa que está aberto no computador. Programas que posso fechar: ${Object.keys(FECHAVEIS).join(", ")}.`,
    parameters: {
      type: "object",
      properties: { nome: { type: "string", enum: Object.keys(FECHAVEIS) } },
      required: ["nome"],
    },
    async run({ nome }) {
      onlyWindows();
      return closeProgram(nome);
    },
  },
  {
    name: "janela_jarvis",
    description: "Mostra (traz para a frente) ou esconde (minimiza) a janela do próprio Jarvis. Escondido, ele continua ouvindo e respondendo.",
    parameters: {
      type: "object",
      properties: { acao: { type: "string", enum: JANELA } },
      required: ["acao"],
    },
    async run({ acao }) {
      onlyWindows();
      if (!JANELA.includes(acao)) throw new Error(`Ação desconhecida: ${acao}`);
      await runPs("janela.ps1", ["-Acao", acao]);
      return acao === "mostrar" ? "Janela à vista." : "Janela minimizada; continuo ouvindo.";
    },
  },
  {
    name: "tocar_spotify",
    description: "Toca no Spotify uma música, artista, playlist ou álbum. Pode tocar no computador, no celular ou na caixinha Echo da Alexa (aparelho 'alexa'). Use sempre que pedirem para tocar uma música.",
    parameters: {
      type: "object",
      properties: {
        busca: { type: "string", description: "O que procurar, por exemplo 'Back in Black AC/DC' ou 'lofi'" },
        tipo: { type: "string", enum: ["musica", "artista", "playlist", "album"] },
        aparelho: { type: "string", description: "Onde tocar, se ele disser: alexa, pc, celular ou o nome do aparelho" },
      },
      required: ["busca"],
    },
    async run(input) {
      return spotify.play(input);
    },
  },
  {
    name: "controlar_spotify",
    description: "Controla o Spotify em qualquer aparelho (inclusive na Alexa): pausar, continuar, próxima, anterior, volume de 0 a 100, ou transferir a música para outro aparelho.",
    parameters: {
      type: "object",
      properties: {
        acao: { type: "string", enum: ["pausar", "continuar", "proxima", "anterior", "volume", "transferir"] },
        valor: { type: "integer", description: "Volume de 0 a 100" },
        aparelho: { type: "string", description: "alexa, pc, celular ou nome do aparelho (obrigatório para transferir)" },
      },
      required: ["acao"],
    },
    async run(input) {
      return spotify.control(input);
    },
  },
  {
    name: "controlar_led",
    description: `Muda o LED do computador (ASUS Aura / Armoury Crate): pôr uma cor, apagar, ou devolver para o efeito do Armoury Crate. Cores: ${Object.keys(CORES).join(", ")}, ou um código como #FF8800.`,
    parameters: {
      type: "object",
      properties: {
        acao: { type: "string", enum: ["cor", "desligar", "devolver"] },
        cor: { type: "string", description: "Nome da cor ou código, quando a ação for cor" },
      },
      required: ["acao"],
    },
    async run({ acao, cor }) {
      return setLed(acao, cor);
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
      await runPs("midia.ps1", ["-Tecla", String(key), "-Vezes", String(n)]);
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

async function closeProgram(nome) {
  const exes = FECHAVEIS[String(nome || "").toLowerCase()];
  if (!exes) throw new Error(`Não sei fechar "${nome}".`);
  const code = await runWait("taskkill.exe", ["/F", "/T", ...exes.flatMap((e) => ["/IM", e])]);
  return code === 0 ? `${nome} fechado.` : `${nome} não estava aberto.`;
}

async function openProgram(nome) {
  const atalho = PROGRAMAS[String(nome || "").toLowerCase()];
  if (atalho) {
    if (atalho.uri) await run("explorer.exe", [atalho.uri]);
    else await run("cmd.exe", ["/c", "start", atalho.exe]);
    return `Abrindo ${nome}.`;
  }
  const app = await findStartApp(nome);
  if (!app) throw new Error(`Não encontrei "${nome}" entre os programas instalados.`);
  await openApp(app.id);
  return `Abrindo ${app.name}.`;
}

// Executa as ações de um modo, uma depois da outra; uma falha não para as outras.
export async function runMode(modo) {
  const feitos = [];
  for (const a of modo.acoes) {
    try {
      if (a.tipo === "site") await openTarget(normalizeUrl(a.alvo));
      else if (a.tipo === "app") a.id ? await openApp(a.id) : await openProgram(a.alvo);
      else if (a.tipo === "fechar") await closeProgram(a.alvo);
      else if (a.tipo === "spotify") await spotify.play({ busca: a.alvo, tipo: a.extra || "playlist" });
      else if (a.tipo === "led") await setLed(a.alvo === "desligado" ? "desligar" : a.alvo === "armoury" ? "devolver" : "cor", a.alvo);
      feitos.push(a.alvo);
    } catch (err) {
      feitos.push(`${a.alvo} (falhou: ${err.message})`);
    }
  }
  return `Modo ${modo.nome} ativado: ${feitos.join(", ")}.`;
}

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
