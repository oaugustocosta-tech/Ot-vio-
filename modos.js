// Modos criados pelo usuário na tela "Modos" (por exemplo "trabalho" ou "game"). Cada modo é uma
// lista de ações: abrir site, abrir programa, fechar programa. Ficam salvos em modos.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalize, validAppId } from "./apps.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ARQUIVO = path.join(here, "modos.json");

export function loadModes() {
  try {
    const data = JSON.parse(fs.readFileSync(ARQUIVO, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// "modo trabalho", "Trabalho", "o modo de trabalho" -> o modo "trabalho".
export function findMode(nome) {
  const q = normalize(nome).replace(/^(o |a )?(modo )?(de |do |da )?/, "");
  const modes = loadModes();
  return modes.find((m) => normalize(m.nome) === q) || modes.find((m) => q && normalize(m.nome).includes(q)) || null;
}

const isWebUrl = (u) => {
  try {
    return /^https?:$/.test(new URL(u).protocol);
  } catch {
    return false;
  }
};

// Confere tudo antes de salvar: só ações conhecidas, sites da web e programas válidos.
export function saveModes(modes, { fechaveis, conhecidos, instalados }) {
  if (!Array.isArray(modes) || modes.length > 40) throw new Error("Lista de modos inválida.");
  const clean = modes.map((m) => {
    const nome = String(m?.nome || "").trim().slice(0, 40);
    if (!nome) throw new Error("Todo modo precisa de um nome.");
    if (!Array.isArray(m.acoes) || !m.acoes.length || m.acoes.length > 30) throw new Error(`O modo "${nome}" precisa de 1 a 30 ações.`);
    const acoes = m.acoes.map((a) => {
      if (a?.tipo === "site") {
        let url = String(a.alvo || "").trim();
        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
        if (!isWebUrl(url)) throw new Error(`Site inválido no modo "${nome}".`);
        return { tipo: "site", alvo: url };
      }
      if (a?.tipo === "app") {
        if (!a.id && conhecidos.has(a.alvo)) return { tipo: "app", alvo: a.alvo };
        if (!validAppId(a.id) || (instalados.size && !instalados.has(a.id))) throw new Error(`Programa inválido no modo "${nome}".`);
        return { tipo: "app", alvo: String(a.alvo || "").slice(0, 120), id: a.id };
      }
      if (a?.tipo === "fechar" && fechaveis.has(a.alvo)) return { tipo: "fechar", alvo: a.alvo };
      throw new Error(`Ação inválida no modo "${nome}".`);
    });
    return { nome, acoes };
  });
  const names = new Set(clean.map((m) => normalize(m.nome)));
  if (names.size !== clean.length) throw new Error("Há dois modos com o mesmo nome.");
  fs.writeFileSync(ARQUIVO, JSON.stringify(clean, null, 2));
  return clean;
}
