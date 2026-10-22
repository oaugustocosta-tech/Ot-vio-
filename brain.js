// O "cérebro" do Ultron. Usa o Claude se houver ANTHROPIC_API_KEY; senão o Gemini (plano grátis
// do Google) se houver GEMINI_API_KEY. Os dois recebem as mesmas ferramentas de tools.js.
import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, runTool } from "./tools.js";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const CLAUDE_MODEL = process.env.ULTRON_MODEL || "claude-opus-5-5";
// Modelos do Gemini, do mais rápido para o mais capaz. Se um estiver sobrecarregado (erro 503)
// ou fora do ar, o próximo é usado na hora.
const GEMINI_MODELS = process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL]
  : ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-2.5-flash"];
const MAX_STEPS = 6; // limite de rodadas de ferramenta por pergunta

export const BRAIN = ANTHROPIC_KEY ? "claude" : GEMINI_KEY ? "gemini" : "none";
export const BRAIN_LABEL = { claude: `Claude (${CLAUDE_MODEL})`, gemini: `Gemini (${GEMINI_MODELS[0]}, plano grátis)`, none: "nenhum" }[BRAIN];

export const NAME = process.env.ULTRON_USER || "Otávio";

const SYSTEM_PROMPT = `Você é ULTRON, o assistente pessoal de voz de ${NAME}. Você aparece como uma orbe de luz e fala com ele em voz alta.

Personalidade:
- Calmo, confiante e inteligente, com um humor seco e leve. Um parceiro, não um robô servil.
- Responde de verdade ao que perguntam: explica, opina, ajuda a pensar, conversa sobre qualquer assunto.

Ações:
- Você pode agir no computador de ${NAME} usando as ferramentas disponíveis (abrir sites, pesquisar, abrir programas, controlar música e volume, bloquear a tela).
- Quando ele pedir algo que uma ferramenta faz, use a ferramenta em vez de explicar como fazer.
- Depois de agir, confirme em poucas palavras ("Pronto, abri o YouTube."). Se falhar, diga o que houve.
- Se pedirem algo que nenhuma ferramenta faz (como controlar luzes ou a Alexa), diga que ainda não tem essa conexão.

Regras de fala (sua resposta vira voz):
- Português do Brasil.
- Respostas curtas: 1 a 3 frases, a menos que peçam algo longo.
- Sem markdown, listas, emojis, asteriscos ou descrições de ações entre parênteses. Só as palavras que você diria.
- Nunca diga que é Claude, Gemini, um modelo de linguagem ou um assistente de IA genérico. Você é Ultron.`;

// Data e hora vão junto da última mensagem (e não no prompt de sistema) para não quebrar o cache.
function withClock(history) {
  const now = new Date().toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" });
  const last = history.at(-1);
  return [...history.slice(0, -1), { ...last, content: `[Agora: ${now}]\n${last.content}` }];
}

export class BrainError extends Error {}

// --- Claude ------------------------------------------------------------------
let anthropic = null;
const CLAUDE_TOOLS = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));

async function chatClaude(history, send, signal) {
  anthropic ??= new Anthropic();
  const messages = withClock(history);
  for (let step = 0; step < MAX_STEPS; step++) {
    if (step > 0) send("text", " ");
    const stream = anthropic.beta.messages.stream(
      {
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        // Conversa falada: prioriza latência baixa.
        output_config: { effort: "low" },
        cache_control: { type: "ephemeral" },
        // Se o modelo recusar, o servidor reexecuta automaticamente num modelo de fallback.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM_PROMPT,
        tools: CLAUDE_TOOLS,
        messages,
      },
      { signal },
    );
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") send("text", event.delta.text);
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      send("text", "Esse assunto eu prefiro não tocar.");
      return;
    }
    if (final.stop_reason !== "tool_use") return;

    messages.push({ role: "assistant", content: final.content });
    const results = [];
    for (const block of final.content) {
      if (block.type !== "tool_use") continue;
      send("action", block.name);
      const r = await runTool(block.name, block.input);
      results.push({ type: "tool_result", tool_use_id: block.id, content: r.text, is_error: !r.ok });
    }
    messages.push({ role: "user", content: results });
  }
}

function describeClaudeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return "Chave da Anthropic inválida (ANTHROPIC_API_KEY).";
  if (err instanceof Anthropic.RateLimitError) return "Limite de uso atingido. Tente de novo em instantes.";
  if (err instanceof Anthropic.APIConnectionError) return "Sem conexão com a internet.";
  if (err instanceof Anthropic.APIError) return `Erro da API da Anthropic (${err.status}): ${err.message}`;
  return null;
}

// --- Gemini ------------------------------------------------------------------
const GEMINI_TOOLS = [
  {
    functionDeclarations: TOOLS.map((t) =>
      // O Gemini não aceita objeto sem propriedades; nesse caso a ferramenta vai sem parâmetros.
      Object.keys(t.parameters.properties).length
        ? { name: t.name, description: t.description, parameters: t.parameters }
        : { name: t.name, description: t.description },
    ),
  },
];

async function* readSse(body) {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value.replace(/\r\n/g, "\n");
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const data = raw
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (data) yield JSON.parse(data);
    }
  }
}

// Pensar antes de responder deixa o Gemini lento demais para conversa falada: pede o mínimo.
// Os modelos 2.5 e 3 usam campos diferentes; se um modelo recusar, vai sem a configuração.
function thinkingConfig(model) {
  if (noThinkingConfig.has(model)) return undefined;
  return /2\.5/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: "minimal" };
}
const noThinkingConfig = new Set();
let geminiPreferred = 0; // índice do último modelo que respondeu bem

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function geminiPost(model, body, signal) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
    body: JSON.stringify(body),
    signal,
  });
}

// Faz a chamada tentando os modelos em ordem. `only` fixa um modelo (rodadas de ferramenta
// precisam continuar no mesmo modelo, por causa das assinaturas de pensamento).
async function geminiFetch(payload, signal, only) {
  const order = only ? [only] : [...GEMINI_MODELS.slice(geminiPreferred), ...GEMINI_MODELS.slice(0, geminiPreferred)];
  let lastStatus = 0;
  let lastBody = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const model of order) {
      const thinking = thinkingConfig(model);
      const body = thinking ? { ...payload, generationConfig: { thinkingConfig: thinking } } : payload;
      let res = await geminiPost(model, body, signal);
      if (res.status === 400 && thinking) {
        const text = await res.text();
        if (!/think/i.test(text)) throw new BrainError(describeGeminiError(400, text));
        noThinkingConfig.add(model);
        res = await geminiPost(model, payload, signal);
      }
      if (res.ok) {
        if (!only) geminiPreferred = GEMINI_MODELS.indexOf(model);
        return { res, model };
      }
      lastStatus = res.status;
      lastBody = await res.text();
      if (!RETRYABLE.has(res.status) && res.status !== 404) throw new BrainError(describeGeminiError(res.status, lastBody));
      console.warn(`  Gemini ${model}: ${res.status}, tentando outro…`);
    }
    await sleep(800);
  }
  throw new BrainError(describeGeminiError(lastStatus, lastBody));
}

async function chatGemini(history, send, signal) {
  const contents = withClock(history).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  let model = null;
  for (let step = 0; step < MAX_STEPS; step++) {
    if (step > 0) send("text", " ");
    const payload = { systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents, tools: GEMINI_TOOLS };
    const got = await geminiFetch(payload, signal, model);
    const res = got.res;
    model = got.model;

    // Guarda as partes exatamente como vieram: o Gemini exige receber de volta as
    // "assinaturas de pensamento" que acompanham as chamadas de ferramenta.
    const parts = [];
    for await (const chunk of readSse(res.body)) {
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        parts.push(part);
        if (part.text && !part.thought) send("text", part.text);
      }
      if (chunk.promptFeedback?.blockReason) {
        send("text", "Esse assunto eu prefiro não tocar.");
        return;
      }
    }
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) return;

    contents.push({ role: "model", parts });
    const responses = [];
    for (const { functionCall } of calls) {
      send("action", functionCall.name);
      const r = await runTool(functionCall.name, functionCall.args);
      responses.push({
        functionResponse: { name: functionCall.name, response: r.ok ? { resultado: r.text } : { erro: r.text } },
      });
    }
    contents.push({ role: "user", parts: responses });
  }
}

function describeGeminiError(status, body) {
  let msg = body;
  try {
    msg = JSON.parse(body).error?.message || body;
  } catch {}
  if (status === 429) return "Acabou o limite grátis do Gemini por agora. Espere um minuto (ou até amanhã, se for o limite do dia).";
  if (status >= 500) return "Os servidores do Gemini estão sobrecarregados agora. Tente de novo em alguns segundos.";
  if (/API key/i.test(msg)) return "Chave do Gemini inválida. Confira GEMINI_API_KEY no arquivo .env.";
  return `Erro do Gemini (${status}): ${String(msg).slice(0, 200)}`;
}

// --- Entrada única -----------------------------------------------------------
export async function chat(history, send, signal) {
  if (BRAIN === "claude") return chatClaude(history, send, signal);
  if (BRAIN === "gemini") return chatGemini(history, send, signal);
  throw new BrainError(
    "Estou sem cérebro: nenhuma chave configurada. Coloque uma GEMINI_API_KEY (grátis em aistudio.google.com) no arquivo .env e reinicie.",
  );
}

export function describeError(err) {
  if (err instanceof BrainError) return err.message;
  const claude = describeClaudeError(err);
  if (claude) return claude;
  if (err?.cause?.code === "ENOTFOUND" || /fetch failed/i.test(err?.message)) return "Sem conexão com a internet.";
  return String(err?.message || err);
}
