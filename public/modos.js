// Tela "Modos": o usuário cria modos (trabalho, game...) com os sites e programas de cada um.
// Depois é só dizer "Jarvis, modo trabalho".
const $ = (id) => document.getElementById(id);

const TIPOS = { site: "Abrir site", app: "Abrir programa", fechar: "Fechar" };

let modos = [];
let apps = []; // programas instalados (menu Iniciar)
let atalhos = []; // nomes conhecidos (bloco de notas, calculadora...)
let fechaveis = [];
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

const descreve = (a) => `${TIPOS[a.tipo]}: ${a.alvo.replace(/^https?:\/\//, "")}`;

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

function trocarTipo() {
  const tipo = $("actType").value;
  $("actTarget").hidden = tipo === "fechar";
  $("actClose").hidden = tipo !== "fechar";
  $("actTarget").value = "";
  $("actTarget").placeholder = tipo === "site" ? "Endereço, ex.: mail.google.com" : "Digite e escolha da lista";
  if (tipo === "app") $("actTarget").setAttribute("list", "appList");
  else $("actTarget").removeAttribute("list");
}

function adicionar() {
  const tipo = $("actType").value;
  if (tipo === "fechar") {
    rascunho.push({ tipo, alvo: $("actClose").value });
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
    $("actClose").innerHTML = "";
    for (const f of fechaveis) $("actClose").append(el("option", { value: f, textContent: f }));
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

export function initModes() {
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
