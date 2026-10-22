// Conexão com a internet: ajustes para redes lentas e o motivo das falhas em português.
import net from "node:net";
import dns from "node:dns";

// O Node tenta o endereço IPv6 e o IPv4 de cada site com só 250 ms para cada um. Numa rede
// ocupada (download, outro programa usando a internet) as duas tentativas estouram e tudo
// falha de uma vez: voz, cérebro e Spotify. Com mais folga e IPv4 primeiro, isso não acontece.
net.setDefaultAutoSelectFamilyAttemptTimeout?.(2_500);
dns.setDefaultResultOrder("ipv4first");

// "fetch failed" não diz nada: o motivo de verdade vem em err.cause.
export function motivoRede(err) {
  const causa = err?.cause || err;
  const code = String(causa?.code || causa?.name || "");
  if (err?.name === "TimeoutError" || /TIMEOUT|ETIMEDOUT/.test(code)) return "a conexão demorou demais (internet lenta ou ocupada)";
  if (/ENOTFOUND|EAI_AGAIN/.test(code)) return "não achei o endereço (sem internet ou DNS com problema)";
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/.test(code)) {
    return "a conexão segura foi interceptada (antivírus ou programa vigiando HTTPS)";
  }
  if (/ECONNRESET|ECONNREFUSED|EPIPE|UND_ERR_SOCKET/.test(code)) return "a conexão foi cortada (firewall, antivírus, VPN ou proxy)";
  return causa?.message ? `${causa.message}${code ? ` (${code})` : ""}` : String(err?.message || err);
}
