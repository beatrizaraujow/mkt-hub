import "server-only";
import { headers } from "next/headers";

/**
 * O endereço público do sistema, para montar link que vai sair daqui.
 *
 * Dentro do navegador o `window.location.origin` resolve isso sozinho. Num
 * e-mail não: quem monta o link é o servidor, e o servidor não sabe por qual
 * endereço a pessoa chegou até ele.
 *
 * A ordem importa. `APP_URL` vem primeiro porque é a única fonte que continua
 * certa quando a requisição não veio de um navegador — cron, script, webhook.
 * O cabeçalho é o segundo melhor: acerta em produção e em `localhost` sem
 * ninguém configurar nada, que é o que faz o ambiente de desenvolvimento
 * funcionar recém-clonado.
 *
 * Não uso `VERCEL_URL`: ela aponta para o endereço único do deploy
 * (`mkt-hub-abc123.vercel.app`), que muda a cada publicação. Um convite de 7
 * dias apontando para lá vira link morto no deploy seguinte.
 */
export async function appOrigin(): Promise<string> {
  const fixo = process.env.APP_URL?.trim();
  if (fixo) return fixo.replace(/\/+$/, "");

  const cabecalhos = await headers();
  const host = cabecalhos.get("x-forwarded-host") ?? cabecalhos.get("host");
  if (!host) {
    throw new Error("Não sei o endereço do sistema para montar o link. Defina APP_URL.");
  }
  const protocolo = cabecalhos.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocolo}://${host}`;
}
