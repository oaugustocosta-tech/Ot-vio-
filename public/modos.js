// Tela "Modos": o usuário cria modos (trabalho, game...) com os sites e programas de cada um.
// Depois é só dizer "Jarvis, modo trabalho".
const $ = (id) => document.getElementById(id);

const TIPOS = { site: "Abrir site", app: "Abrir programa", fechar: "Fechar", spotify: "Tocar no Spotify", led: "LED" };

let modos = [];
let apps = []; // programas instalados (menu Iniciar)
let atalhos = []; // nomes conhecidos (bloco de notas, calculadora...)
let fechaveis = [];
let cores = [];
let rascunho = [];
let editando = null; // nome do modo sendo editado

const post = (url, data) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(async (r) => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    return body;
  });

function msg(text, ok = false) {
  $("modeMsg").textContent = text;
  $("modeMsg").classList.toggle("ok", ok);
}

const descreve = (a) =>
  a.tipo === "led" && a.alvo === "armoury"
    ? "LED: voltar ao Armoury Crate"
    : `${TIPOS[a.tipo]}: ${a.alvo.replace(/^https?:\/\//, "")}${a.tipo === "spotify" ? ` (${a.extra})` : ""}`;

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

function renderLista() {
  const box = $("modeList");
  box.innerHTML = "";
  if (!modos.length) box.append(el("p", { className: "empty", textContent: "Nenhum modo ainda. Crie o primeiro aqui embaixo." }));
  for (const m of modos) {
    const acoes = el("ul");
    for (const a of m.acoes) acoes.append(el("li", { textContent: descreve(a) }));
    const testar = el("button", { type: "button", textContent: "Testar" });
    testar.onclick = async () => {
      try {
        msg((await post("/api/modos/testar", { nome: m.nome })).texto, true);
      } catch (err) {
        msg(err.message);
      }
    };
    const editar = el("button", { type: "button", textContent: "Editar" });
    editar.onclick = () => {
      editando = m.nome;
      $("modeName").value = m.nome;
      rascunho = m.acoes.map((a) => ({ ...a }));
      renderRascunho();
      msg(`Editando "${m.nome}".`, true);
      $("modeName").focus();
    };
    const excluir = el("button", { type: "button", textContent: "Excluir" });
    excluir.onclick = () => salvar(modos.filter((x) => x !== m), `Modo "${m.nome}" excluído.`);
    box.append(el("div", { className: "mode" }, el("b", { textContent: m.nome }), acoes, el("div", { className: "row" }, testar, editar, excluir)));
  }
}

function renderRascunho() {
  const box = $("draft");
  box.innerHTML = "";
  rascunho.forEach((a, i) => {
    const tirar = el("button", { type: "button", textContent: "✕", title: "Tirar" });
    tirar.onclick = () => {
      rascunho.splice(i, 1);
      renderRascunho();
    };
    box.append(el("div", { className: "step" }, el("span", { textContent: descreve(a) }), tirar));
  });
}

const PLACEHOLDER = { site: "Endereço, ex.: mail.google.com", app: "Digite e escolha da lista", spotify: "Ex.: rock clássico, Eminem, lofi" };

function trocarTipo() {
  const tipo = $("actType").value;
  $("actTarget").hidden = tipo === "fechar" || tipo === "led";
  $("actClose").hidden = tipo !== "fechar";
  $("actKind").hidden = tipo !== "spotify";
  $("actColor").hidden = tipo !== "led";
  $("actTarget").value = "";
  $("actTarget").placeholder = PLACEHOLDER[tipo] || "";
  if (tipo === "app") $("actTarget").setAttribute("list", "appList");
  else $("actTarget").removeAttribute("list");
}

function adicionar() {
  const tipo = $("actType").value;
  if (tipo === "fechar") {
    rascunho.push({ tipo, alvo: $("actClose").value });
  } else if (tipo === "led") {
    rascunho.push({ tipo, alvo: $("actColor").value });
  } else if (tipo === "spotify") {
    const alvo = $("actTarget").value.trim();
    if (!alvo) return msg("Diga o que tocar.");
    rascunho.push({ tipo, alvo, extra: $("actKind").value });
  } else {
    const alvo = $("actTarget").value.trim();
    if (!alvo) return msg("Preencha o site ou programa.");
    if (tipo === "site") rascunho.push({ tipo, alvo });
    else {
      const app = apps.find((a) => a.name.toLowerCase() === alvo.toLowerCase());
      if (app) rascunho.push({ tipo, alvo: app.name, id: app.id });
      else if (atalhos.includes(alvo.toLowerCase())) rascunho.push({ tipo, alvo: alvo.toLowerCase() });
      else return msg("Escolha um programa da lista que aparece enquanto você digita.");
    }
  }
  $("actTarget").value = "";
  msg("");
  renderRascunho();
}

async function salvar(lista, ok) {
  try {
    modos = (await post("/api/modos", { modos: lista })).modos;
    renderLista();
    msg(ok, true);
    return true;
  } catch (err) {
    msg(err.message);
    return false;
  }
}

async function carregar() {
  try {
    const r = await (await fetch("/api/modos")).json();
    modos = r.modos;
    atalhos = r.programas;
    fechaveis = r.fechaveis;
    cores = r.cores;
    $("actClose").innerHTML = "";
    for (const f of fechaveis) $("actClose").append(el("option", { value: f, textContent: f }));
    $("actColor").innerHTML = "";
    for (const c of cores) $("actColor").append(el("option", { value: c, textContent: c === "desligado" ? "apagar" : c }));
    $("actColor").append(el("option", { value: "armoury", textContent: "voltar ao Armoury Crate" }));
    renderLista();
  } catch {
    msg("Não consegui carregar os modos.");
  }
  // A lista de programas demora um pouco no Windows; carrega por trás.
  fetch("/api/apps")
    .then((r) => r.json())
    .then((list) => {
      apps = list;
      $("appList").innerHTML = "";
      const nomes = [...new Set([...apps.map((a) => a.name), ...atalhos])];
      for (const n of nomes) $("appList").append(el("option", { value: n }));
    })
    .catch(() => {});
}

// --- Conexão com o Spotify ---------------------------------------------------
async function renderSpotify() {
  const box = $("spotifyBox");
  let st;
  try {
    st = await (await fetch("/api/spotify")).json();
  } catch {
    return;
  }
  box.innerHTML = "";
  box.append(el("b", { textContent: "Spotify" }));
  if (st.conectado) {
    const trocar = el("button", { type: "button", textContent: "Reconectar" });
    trocar.onclick = () => window.open("/spotify/login", "spotify", "width=520,height=720");
    box.append(el("p", { textContent: "Conectado. Diga: \"Jarvis, toca tal música\" ou \"... na Alexa\"." }), el("div", { className: "row" }, trocar));
    return;
  }
  if (st.configurado) {
    const conectar = el("button", { type: "button", className: "send", textContent: "Conectar Spotify" });
    conectar.onclick = () => window.open("/spotify/login", "spotify", "width=520,height=720");
    box.append(el("p", { textContent: "Falta entrar com sua conta (precisa ser Premium)." }), el("div", { className: "row" }, conectar));
    return;
  }
  const passos = el(
    "ol",
    {},
    el("li", {}, "Abra ", el("a", { href: "https://developer.spotify.com/dashboard", target: "_blank", rel: "noopener", textContent: "developer.spotify.com/dashboard" }), " e entre com sua conta."),
    el("li", { textContent: "Clique em Create app. Nome e descrição: Jarvis." }),
    el("li", {}, "Em Redirect URI, cole ", el("code", { textContent: st.redirect }), " e clique em Add."),
    el("li", { textContent: "Marque Web API, aceite os termos e salve." }),
    el("li", { textContent: "Copie o Client ID e cole aqui embaixo." }),
  );
  const input = el("input", { placeholder: "Client ID", autocomplete: "off", maxLength: 40 });
  const salvar = el("button", { type: "button", className: "send", textContent: "Salvar" });
  salvar.onclick = async () => {
    try {
      await post("/api/spotify", { clientId: input.value });
      renderSpotify();
    } catch (err) {
      msg(err.message);
    }
  };
  box.append(el("p", { textContent: "Para tocar música no PC ou na Alexa (precisa de Spotify Premium):" }), passos, el("div", { className: "addrow" }, input, salvar));
}

export function initModes() {
  renderSpotify();
  // Depois de conectar na janelinha do Spotify, atualiza ao voltar para o Jarvis.
  addEventListener("focus", renderSpotify);
  $("actType").addEventListener("change", trocarTipo);
  $("actAdd").addEventListener("click", adicionar);
  $("actTarget").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      adicionar();
    }
  });
  $("modeCancel").addEventListener("click", () => {
    editando = null;
    rascunho = [];
    $("modeName").value = "";
    renderRascunho();
    msg("");
  });
  $("modeForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = $("modeName").value.trim().replace(/^modo\s+/i, "");
    if (!nome) return msg("Dê um nome ao modo, por exemplo: trabalho.");
    if (!rascunho.length) return msg("Adicione pelo menos uma ação.");
    const novo = { nome, acoes: rascunho };
    const lista = editando ? modos.map((m) => (m.nome === editando ? novo : m)) : [...modos, novo];
    if (await salvar(lista, `Modo "${nome}" salvo. Diga: "Jarvis, modo ${nome}".`)) {
      editando = null;
      rascunho = [];
      $("modeName").value = "";
      renderRascunho();
    }
  });
  trocarTipo();
  carregar();
}
