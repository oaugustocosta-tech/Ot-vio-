// Diagnóstico (botão na tela Ajustes): testa cada peça que depende da internet e diz,
// em português, o que está funcionando e o que não está.
import { elevenLabs, azureTts, edgeTts } from "./speech.js";
import { motivoRede } from "./rede.js";
import * as spotify from "./spotify.js";
import { listarJanelas } from "./tools.js";
import { contarLed } from "./led.js";
import { versaoLocal, versaoNova } from "./atualizar.js";

const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY || "";
const GROQ_KEY = process.env.GROQ_API_KEY || "";
const AZURE_KEY = process.env.AZURE_SPEECH_KEY || "";

// Roda um teste com tempo limite e mede quanto demorou.
async function teste(nome, fn) {
  const t0 = Date.now();
  try {
    const detalhe = await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error("demorou mais de 15 segundos")), 15_000))]);
    return { nome, ok: true, ms: Date.now() - t0, detalhe: detalhe || "" };
  } catch (err) {
    const msg = err?.cause || err?.name === "TimeoutError" ? motivoRede(err) : err.message;
    return { nome, ok: false, ms: Date.now() - t0, detalhe: msg };
  }
}

async function get(url, headers = {}) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  const body = await r.text();
  return { status: r.status, body };
}

const WINDOWS = process.platform === "win32";

export async function diagnostico() {
  const testes = [
    teste("Versão do Jarvis", async () => {
      const local = versaoLocal();
      const nova = await versaoNova();
      if (nova && local && nova.sha !== local) throw new Error(`tem versão nova (${nova.sha.slice(0, 7)}): feche o Jarvis e abra pelo atalho`);
      return local ? `${local.slice(0, 7)}${nova ? " (a mais nova)" : ""}` : "desconhecida (abra pelo atalho para atualizar)";
    }),
    teste("Internet", async () => {
      const { status } = await get("https://www.google.com/generate_204");
      if (status >= 400) throw new Error(`resposta ${status}`);
    }),
    teste("Cérebro (Groq)", async () => {
      if (!GROQ_KEY) throw new Error("sem GROQ_API_KEY");
      const { status } = await get("https://api.groq.com/openai/v1/models", { Authorization: `Bearer ${GROQ_KEY}` });
      if (status === 401) throw new Error("chave do Groq recusada");
      if (status >= 400) throw new Error(`Groq respondeu ${status}`);
    }),
    teste("Voz ElevenLabs", async () => {
      if (!ELEVEN_KEY) return "sem chave (opcional)";
      await elevenLabs("Ok.");
    }),
    teste("Voz Azure", async () => {
      if (!AZURE_KEY) return "sem chave (opcional)";
      await azureTts("Ok.");
    }),
    teste("Voz Microsoft (grátis)", async () => {
      await edgeTts("Ok.");
    }),
    teste("Spotify", async () => {
      const st = spotify.status();
      if (!st.conectado) throw new Error(st.configurado ? "falta clicar em Conectar no quadro Spotify" : "não conectado (quadro Spotify em Modos)");
      const lista = await spotify.devices();
      return lista.length ? `aparelhos: ${lista.map((d) => d.name).join(", ")}` : "conectado, mas nenhum aparelho aberto agora";
    }),
    teste("Janelas e monitores", async () => {
      if (!WINDOWS) return "só no Windows";
      const { janelas, monitores } = await listarJanelas();
      const nomes = [...new Set(janelas.slice(0, 4).map((j) => j.processo))].join(", ");
      return `${monitores} monitor(es), ${janelas.length} janelas abertas${nomes ? ` (${nomes}...)` : ""}`;
    }),
    teste("LED (Aura)", async () => {
      if (!WINDOWS) return "só no Windows";
      return contarLed();
    }),
  ];
  const resultados = await Promise.all(testes);
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxy) resultados.push({ nome: "Proxy do Windows", ok: true, ms: 0, detalhe: proxy });
  for (const r of resultados) console.log(`  Diagnóstico ${r.ok ? "OK  " : "ERRO"} ${r.nome} (${r.ms} ms) ${r.detalhe}`);
  return resultados;
}
