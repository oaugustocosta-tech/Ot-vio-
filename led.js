// LED do PC pelo ASUS Aura (o serviço de iluminação que vem com o Armoury Crate).
// Usa o "Aura SDK" que o próprio serviço registra no Windows (objeto COM aura.sdk.1).
// O windows/aura.ps1 fica aberto em segundo plano segurando o controle das luzes: quando o Jarvis
// "devolve", o Armoury Crate volta ao efeito que estava configurado nele.
import { spawnPs } from "./windows.js";

export const CORES = {
  vermelho: "FF0000",
  verde: "00FF00",
  azul: "0000FF",
  branco: "FFFFFF",
  amarelo: "FFC800",
  laranja: "FF6400",
  roxo: "8000FF",
  rosa: "FF3CB4",
  ciano: "00FFFF",
  desligado: "000000",
};

let proc = null;
let ready = null;
let waiting = [];

// Alguns Armoury Crate só registram o Aura para programas de 32 bits: tenta os dois.
function start() {
  if (process.platform !== "win32") return Promise.reject(new Error("O LED só funciona no Windows."));
  if (ready) return ready;
  ready = open(false).catch((err) => {
    console.error(`  LED (64 bits): ${err.message}`);
    return open(true);
  });
  ready.catch((err) => {
    console.error(`  LED (32 bits): ${err.message}`);
    ready = null;
  });
  return ready;
}

function open(x86) {
  return new Promise((resolve, reject) => {
    proc = spawnPs("aura.ps1", [], { x86 });
    let buf = "";
    let first = true;
    proc.stdout.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (first) {
          first = false;
          if (line === "PRONTO") resolve();
          else reject(new Error(`Não achei o Aura no Windows (${line.replace(/^ERRO sdk\s*/, "") || "sem resposta"}). Confira se o Armoury Crate está instalado com o Aura Sync e se o serviço de iluminação está rodando.`));
        } else waiting.shift()?.(line);
      }
    });
    const me = proc;
    me.on("error", reject);
    me.on("exit", () => {
      reject(new Error("O controle do LED fechou antes de começar."));
      if (proc !== me) return;
      proc = null;
      ready = null;
      for (const w of waiting) w("ERRO o controle do LED fechou");
      waiting = [];
    });
    setTimeout(() => reject(new Error("O Aura demorou demais para responder.")), 15_000);
  }).catch((err) => {
    proc?.kill();
    proc = null;
    throw err;
  });
}

async function send(cmd) {
  await start();
  const reply = await new Promise((resolve) => {
    waiting.push(resolve);
    proc.stdin.write(`${cmd}\n`);
  });
  if (reply === "ERRO nenhum") {
    throw new Error("O Aura respondeu, mas não encontrou nenhuma luz. Abra o Armoury Crate e veja se ele mesmo consegue mudar a cor do gabinete; no Windows 11, desligue também a Iluminação Dinâmica (Configurações > Personalização > Iluminação dinâmica).");
  }
  if (!reply.startsWith("OK")) throw new Error(`LED: ${reply.replace(/^ERRO\s*/, "")}`);
  return reply.split(" ").slice(1).map(Number);
}

// Aceita nome de cor ("azul") ou código ("#FF8800").
export function parseCor(cor) {
  const c = String(cor || "").trim().toLowerCase();
  const hex = CORES[c] || (/^#?[0-9a-f]{6}$/.test(c) ? c.replace("#", "") : null);
  if (!hex) throw new Error(`Não conheço a cor "${cor}". Cores: ${Object.keys(CORES).join(", ")}.`);
  return hex;
}

export async function setLed(acao, cor) {
  if (acao === "devolver") {
    await send("soltar");
    return "LED de volta para o Armoury Crate.";
  }
  const hex = acao === "desligar" ? "000000" : parseCor(cor);
  // O Aura usa a ordem azul-verde-vermelho.
  const [r, g, b] = [0, 2, 4].map((i) => hex.slice(i, i + 2));
  const [placas, luzes] = await send(`cor ${parseInt(b + g + r, 16)}`);
  const onde = placas ? ` (${placas} aparelho${placas > 1 ? "s" : ""}, ${luzes} luzes)` : "";
  return (acao === "desligar" ? "LED apagado" : `LED em ${cor}`) + `${onde}.`;
}
