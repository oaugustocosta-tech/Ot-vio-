// LED do PC pelo ASUS Aura (o serviço de iluminação que vem com o Armoury Crate).
// Usa o "Aura SDK" que o próprio serviço registra no Windows (objeto COM aura.sdk.1).
// Um PowerShell fica aberto em segundo plano segurando o controle das luzes: quando o Jarvis
// "devolve", o Armoury Crate volta ao efeito que estava configurado nele.
import { spawn } from "node:child_process";

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

const SCRIPT = `
try { $sdk = New-Object -ComObject aura.sdk.1 } catch { [Console]::Out.WriteLine('ERRO sdk'); exit 1 }
[Console]::Out.WriteLine('PRONTO')
$ativo = $false
while ($true) {
  $linha = [Console]::In.ReadLine()
  if ($linha -eq $null) { break }
  try {
    $p = $linha.Split(' ')
    if ($p[0] -eq 'soltar') {
      if ($ativo) { $sdk.ReleaseControl(0); $ativo = $false }
    } else {
      if (-not $ativo) { $sdk.SwitchMode(); $ativo = $true }
      $cor = [uint32]$p[1]
      foreach ($dev in $sdk.Enumerate(0)) { foreach ($luz in $dev.Lights) { $luz.Color = $cor }; $dev.Apply() }
    }
    [Console]::Out.WriteLine('OK')
  } catch { [Console]::Out.WriteLine('ERRO ' + $_.Exception.Message) }
}
if ($ativo) { $sdk.ReleaseControl(0) }
`;

let proc = null;
let ready = null;
let waiting = [];

function start() {
  if (process.platform !== "win32") return Promise.reject(new Error("O LED só funciona no Windows."));
  if (ready) return ready;
  ready = new Promise((resolve, reject) => {
    const encoded = Buffer.from(SCRIPT, "utf16le").toString("base64");
    proc = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], { windowsHide: true });
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
          else reject(new Error("Não achei o Aura no Windows. Instale o Armoury Crate (com o Aura) e tente de novo."));
        } else waiting.shift()?.(line);
      }
    });
    proc.on("error", reject);
    proc.on("exit", () => {
      proc = null;
      ready = null;
      for (const w of waiting) w("ERRO o controle do LED fechou");
      waiting = [];
    });
    setTimeout(() => reject(new Error("O Aura demorou demais para responder.")), 15_000);
  });
  ready.catch(() => {
    proc?.kill();
    ready = null;
  });
  return ready;
}

async function send(cmd) {
  await start();
  const reply = await new Promise((resolve) => {
    waiting.push(resolve);
    proc.stdin.write(`${cmd}\n`);
  });
  if (reply !== "OK") throw new Error(`LED: ${reply.replace(/^ERRO\s*/, "")}`);
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
  await send(`cor ${parseInt(b + g + r, 16)}`);
  return acao === "desligar" ? "LED apagado." : `LED em ${cor}.`;
}
