/**
 * Prova que o envio funciona, antes de depender dele para convidar alguém.
 *
 *   npm run mail:teste -- --para voce@grupoquatro5.com
 *   npm run mail:teste -- --so-verificar
 *
 * Duas etapas de propósito. `--so-verificar` autentica no SMTP e desliga sem
 * mandar nada: se a senha de aplicativo estiver errada, o erro aparece aqui,
 * em uma linha, e não como "o convite não chegou" três dias depois.
 *
 * Lê `.env.local`. Para provar a produção, sobrescreva as variáveis no
 * ambiente — são as mesmas quatro.
 */
import { mailConfigured, mailFaltando, sendMail, verificarSmtp } from "@/lib/mail";
import { inviteEmail } from "@/features/people/invite-email";

function arg(nome: string) {
  const i = process.argv.indexOf(`--${nome}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  if (!mailConfigured()) {
    console.error(`Envio desligado. Falta no ambiente: ${mailFaltando().join(", ")}`);
    console.error("Veja o bloco de e-mail no .env.example.");
    process.exit(1);
  }

  console.log(`servidor : ${process.env.SMTP_HOST}:${process.env.SMTP_PORT ?? 465}`);
  console.log(`conta    : ${process.env.SMTP_USER}`);
  console.log(`remetente: ${process.env.MAIL_FROM ?? `MKT Hub <${process.env.SMTP_USER}>`}`);
  console.log("");

  const conexao = await verificarSmtp();
  if (!conexao.sent) {
    console.error(`Não autenticou: ${conexao.reason}`);
    console.error("\n535 quer dizer uma de duas coisas:");
    console.error("  1. A senha é a do login. Precisa ser senha de aplicativo:");
    console.error("     Google -> myaccount.google.com/apppasswords");
    console.error("     Zoho   -> Zoho Account > Security > App Passwords");
    console.error("  2. A conta não existe NESTE servidor. Confira o MX do domínio:");
    console.error(`     nslookup -type=MX ${(process.env.SMTP_USER ?? "@dominio").split("@")[1]}`);
    console.error("     smtp.google.com no MX = use smtp.gmail.com, nao smtp.zoho.com.");
    process.exit(1);
  }
  console.log("Autenticou no SMTP.");

  if (process.argv.includes("--so-verificar")) {
    console.log("Nada foi enviado (--so-verificar).");
    return;
  }

  const para = arg("para");
  if (!para) {
    console.error("\nFalta --para. Ex.: npm run mail:teste -- --para voce@grupoquatro5.com");
    process.exit(1);
  }

  // Manda o convite de verdade, com um link que não leva a lugar nenhum: o
  // que precisa ser testado é a mensagem que o time vai receber, não um
  // "teste 123" que não prova formatação, acento nem se caiu em spam.
  const mensagem = inviteEmail({
    name: "Fulano de Tal",
    inviterName: "Teste do MKT Hub",
    url: "https://www.mkthub.space/convite/ISTO-E-UM-TESTE-NAO-FUNCIONA",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const resultado = await sendMail({
    to: para,
    subject: `[TESTE] ${mensagem.subject}`,
    text: mensagem.text,
    html: mensagem.html,
  });

  if (resultado.sent) {
    console.log(`Enviado para ${para}. Confira a caixa de entrada — e o spam.`);
  } else {
    console.error(`Não enviou: ${resultado.reason}`);
    process.exit(1);
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
