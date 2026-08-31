import nodemailer, { type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

/**
 * Envio de e-mail, por SMTP.
 *
 * Sem `server-only` pelo mesmo motivo de `invite.ts`: o script de convite em
 * lote precisa enviar também, e duas cópias da mesma configuração divergem no
 * dia em que uma mudar.
 *
 * As variáveis são genéricas de propósito, e isso já se pagou: o projeto nasceu
 * apontado para o Zoho e mudou para o Google sem uma linha de código — só o
 * valor de `SMTP_HOST`. Nomear a variável `ZOHO_` teria obrigado a renomear
 * código para trocar de fornecedor.
 *
 * **A casa tem dois provedores, um por domínio.** Confira o MX antes de supor:
 *
 *   @grupoquatro5.com  ->  Google Workspace   smtp.gmail.com
 *   @seubone.com       ->  Zoho Mail          smtp.zoho.com
 *
 * Mandar de um endereço por servidor do outro falha duas vezes: o servidor
 * recusa a autenticação (535, "a conta não existe aqui") e, se passasse, o SPF
 * do domínio não autoriza aquele remetente e a mensagem cai em spam.
 *
 *   SMTP_PORT=465               (SSL; 587 fala STARTTLS)
 *   SMTP_USER=<o endereço que remete>
 *   SMTP_PASSWORD=<senha de aplicativo>
 *
 * A senha **não** é a do login. Com verificação em duas etapas ligada, os dois
 * provedores recusam a senha da conta no SMTP — é preciso gerar uma senha de
 * aplicativo (Google: myaccount.google.com/apppasswords · Zoho: Zoho Account >
 * Security > App Passwords). Ela vale só para isto e pode ser revogada
 * sozinha, sem derrubar o acesso de ninguém ao e-mail.
 */

/**
 * O remetente precisa ser a conta autenticada.
 *
 * O Zoho recusa `From` diferente do usuário do SMTP (ou de um alias verificado
 * na conta) com um 553 que não explica nada. Por isso o padrão é o próprio
 * `SMTP_USER`: quem não configurar `MAIL_FROM` acerta por omissão.
 */
function remetente() {
  const from = process.env.MAIL_FROM?.trim();
  const user = process.env.SMTP_USER?.trim();
  if (from) return from;
  return user ? `MKT Hub <${user}>` : null;
}

export function mailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASSWORD?.trim(),
  );
}

/** O que falta, em português, para a tela poder dizer em vez de só falhar. */
export function mailFaltando(): string[] {
  const faltas: string[] = [];
  if (!process.env.SMTP_HOST?.trim()) faltas.push("SMTP_HOST");
  if (!process.env.SMTP_USER?.trim()) faltas.push("SMTP_USER");
  if (!process.env.SMTP_PASSWORD?.trim()) faltas.push("SMTP_PASSWORD");
  return faltas;
}

let transporte: Transporter | null = null;

function abrir(): Transporter {
  if (transporte) return transporte;

  const port = Number(process.env.SMTP_PORT ?? 465);

  /*
   * Tipado à mão porque `createTransport` tem sete sobrecargas e escolhe a de
   * pool sozinha quando a chave `pool` aparece — mesmo valendo `false`. Sem
   * pool nenhum, que é o certo aqui: a função serverless morre em segundos e
   * não há conexão para reaproveitar.
   */
  const opcoes: SMTPTransport.Options = {
    host: process.env.SMTP_HOST!.trim(),
    port,
    // 465 é SSL do primeiro byte; 587 abre em claro e sobe para TLS no STARTTLS.
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASSWORD!.trim(),
    },
  };

  transporte = nodemailer.createTransport(opcoes);
  return transporte;
}

export type MailResult = { sent: true } | { sent: false; reason: string };

/**
 * **Nunca lança.** Quem chama está no meio de uma operação que já deu certo —
 * o convite foi gravado, a pessoa existe — e perder isso porque o SMTP recusou
 * seria trocar um problema pequeno por um grande. O erro volta como valor, a
 * tela mostra o link, e alguém entrega na mão enquanto o envio não volta.
 */
export async function sendMail(mensagem: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<MailResult> {
  const from = remetente();
  if (!mailConfigured() || !from) {
    return { sent: false, reason: `envio desligado (falta ${mailFaltando().join(", ")})` };
  }

  try {
    await abrir().sendMail({ from, ...mensagem });
    return { sent: true };
  } catch (error) {
    // A mensagem do nodemailer costuma trazer o código SMTP, que é o que
    // permite distinguir senha errada (535) de remetente recusado (553).
    return { sent: false, reason: error instanceof Error ? error.message : "erro desconhecido" };
  }
}

/**
 * Confere as credenciais sem mandar mensagem nenhuma.
 *
 * O `verify` do nodemailer abre a conexão, autentica e desliga. Serve para o
 * script de teste dizer "a senha está errada" em vez de "não enviou".
 */
export async function verificarSmtp(): Promise<MailResult> {
  if (!mailConfigured()) {
    return { sent: false, reason: `falta ${mailFaltando().join(", ")}` };
  }
  try {
    await abrir().verify();
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : "erro desconhecido" };
  }
}
