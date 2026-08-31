/**
 * A mensagem do convite. Função pura: monta texto, não envia.
 *
 * Separada do envio para poder ser testada sem abrir conexão nenhuma — e
 * porque o que este arquivo decide é redação, não infraestrutura.
 *
 * **O inimigo aqui é parecer golpe.** Um e-mail que diz "clique e defina sua
 * senha" tem exatamente o formato do que a gente ensina o time a desconfiar.
 * Se o convite for indistinguível de phishing, uma de duas coisas acontece: a
 * pessoa ignora, ou a pessoa aprende a clicar. As duas são ruins. Por isso a
 * mensagem diz quem convidou pelo nome, o que é o sistema, o que o link faz,
 * quando vence, e o que fazer se não era esperado.
 */

const DATA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

export type InviteEmail = { subject: string; text: string; html: string };

function escapar(valor: string) {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function inviteEmail(dados: {
  /** Quem recebe. Usado só o primeiro nome no corpo. */
  name: string;
  /** Quem convidou, por extenso. Sem isto a mensagem vira anônima. */
  inviterName: string;
  url: string;
  expiresAt: Date;
}): InviteEmail {
  const primeiro = dados.name.trim().split(/\s+/)[0];
  const vence = DATA.format(dados.expiresAt);

  const subject = `${primeiro}, seu acesso ao MKT Hub`;

  const text = [
    `Oi, ${primeiro}.`,
    ``,
    `${dados.inviterName} criou seu acesso ao MKT Hub, o sistema onde o time de`,
    `marketing do Grupo SB passa a tocar as demandas no lugar do ClickUp.`,
    ``,
    `Para entrar, abra o endereço abaixo e escolha sua senha:`,
    ``,
    dados.url,
    ``,
    `O link vale até ${vence} e funciona uma vez só.`,
    `Ninguém além de você vê a senha que escolher — nem quem te convidou.`,
    ``,
    `Se você não esperava este e-mail, não abra o link e avise ${dados.inviterName}.`,
  ].join("\n");

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:520px">
  <p>Oi, ${escapar(primeiro)}.</p>

  <p>
    ${escapar(dados.inviterName)} criou seu acesso ao <strong>MKT Hub</strong>, o sistema onde o
    time de marketing do Grupo SB passa a tocar as demandas no lugar do ClickUp.
  </p>

  <p>Para entrar, escolha sua senha:</p>

  <p style="margin:24px 0">
    <a href="${escapar(dados.url)}"
       style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;font-weight:500">
      Definir minha senha
    </a>
  </p>

  <p style="font-size:13px;color:#666">
    Se o botão não abrir, copie este endereço:<br>
    <span style="word-break:break-all">${escapar(dados.url)}</span>
  </p>

  <p style="font-size:13px;color:#666">
    O link vale até <strong>${escapar(vence)}</strong> e funciona uma vez só.
    Ninguém além de você vê a senha que escolher — nem quem te convidou.
  </p>

  <p style="font-size:13px;color:#666;border-top:1px solid #e5e5e5;padding-top:12px">
    Se você não esperava este e-mail, não abra o link e avise ${escapar(dados.inviterName)}.
  </p>
</div>`.trim();

  return { subject, text, html };
}
