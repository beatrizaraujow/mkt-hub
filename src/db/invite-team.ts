/**
 * Cadastro inicial do time, por convite.
 *
 *   npm run invite -- --base https://www.mkthub.space
 *   npm run invite -- --base http://localhost:3010 --dry
 *   npm run invite -- --base ... --enviar   manda por e-mail tambem
 *
 * Sem `--enviar` ele so imprime os links, como sempre fez. O envio e opcional
 * de proposito: o dia em que o SMTP estiver fora, este script precisa
 * continuar servindo para desbloquear o time.
 *
 * Faz o mesmo que a tela de Time, em lote: cria a pessoa **sem senha**, gera
 * o convite e imprime o link. A senha é definida pela própria pessoa.
 *
 * É idempotente: quem já existe não é recriado. Rodar de novo só gera convite
 * novo para quem ainda não entrou — o que também serve para reenviar.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { companies, userCompanyAccess, users, type UserRole } from "@/db/schema";
import { inviteUrl, newInviteToken } from "@/lib/invite";
import { mailConfigured, sendMail } from "@/lib/mail";
import { inviteEmail } from "@/features/people/invite-email";

type Person = {
  name: string;
  email: string;
  jobTitle: string;
  role: UserRole;
  isMaster?: boolean;
};

/**
 * Papel é o teto no sistema, não o cargo. Todo mundo entra como colaborador
 * por decisão de 25/08/2026; só a Maria Clara valida fechamento de semana.
 */
const TEAM: Person[] = [
  { name: "Maria Clara Carvalho", email: "mariaclara@seubone.com", jobTitle: "Admin Master", role: "admin", isMaster: true },
  { name: "Samuel Melo", email: "samuel.melo@grupoquatro5.com", jobTitle: "Diretor de Arte", role: "colaborador" },
  { name: "Maria Luiza Mariz", email: "marialuiza.mariz@grupoquatro5.com", jobTitle: "Storymaker", role: "colaborador" },
  { name: "Zion Bagatoli", email: "zion.bagatoli@grupoquatro5.com", jobTitle: "Analista de MKT", role: "colaborador" },
  { name: "Klenio Braz", email: "klenio.braz@grupoquatro5.com", jobTitle: "Editor / Audiovisual", role: "colaborador" },
  { name: "Thiago Nascimento", email: "thiago.nascimento@grupoquatro5.com", jobTitle: "Editor / Audiovisual", role: "colaborador" },
];

/**
 * Só as empresas mãe: o acesso alcança as sub-marcas sozinho, e marcar as dez
 * deixaria a lista com nove linhas redundantes que ninguém sabe se pode tirar.
 */
const PARENT_SLUGS = ["seubone", "onevo", "carbone-educacao", "weevo"];

/** A conta que existe passa a ter o e-mail do Grupo Quatro5. */
const RENAME = { from: "mkt.quatro5@gmail.com", to: "anny.beatriz@grupoquatro5.com" };

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const base = arg("base");
  const dry = process.argv.includes("--dry");
  const enviar = process.argv.includes("--enviar");
  const quemConvida = arg("de") ?? "Anny Beatriz";

  if (enviar && !mailConfigured()) {
    console.error("Pediu --enviar mas falta a configuracao de SMTP. Veja o .env.example.");
    process.exit(1);
  }

  if (!base) {
    console.error("Falta --base. Ex.: npm run invite -- --base https://www.mkthub.space");
    process.exit(1);
  }

  const [org] = await db.select().from(companies).limit(1);
  if (!org) {
    console.error("Nenhuma empresa no banco. Rode o seed antes.");
    process.exit(1);
  }
  const orgId = org.orgId;

  const parents = await db
    .select({ id: companies.id, name: companies.name, slug: companies.slug })
    .from(companies)
    .where(and(eq(companies.orgId, orgId), inArray(companies.slug, PARENT_SLUGS)));

  if (parents.length !== PARENT_SLUGS.length) {
    console.error(
      `Esperava ${PARENT_SLUGS.length} empresas mãe e achei ${parents.length}. Confira os slugs.`,
    );
    process.exit(1);
  }

  console.log(dry ? "\n== SIMULAÇÃO, nada foi gravado ==\n" : "");

  /* ------------------------------------------------------------- renomear */

  const [old] = await db.select().from(users).where(eq(users.email, RENAME.from)).limit(1);
  if (old) {
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, RENAME.to)).limit(1);
    if (taken) {
      console.log(`· ${RENAME.to} já está em uso. E-mail de ${old.name} não foi trocado.`);
    } else {
      if (!dry) await db.update(users).set({ email: RENAME.to }).where(eq(users.id, old.id));
      console.log(`· ${old.name}: ${RENAME.from} → ${RENAME.to} (senha e papel inalterados)`);
    }
  }

  /* ------------------------------------------------------------ convidar */

  const links: string[] = [];

  for (const person of TEAM) {
    const [existing] = await db
      .select({ id: users.id, name: users.name, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, person.email))
      .limit(1);

    // Quem já definiu senha não é tocado: gerar convite invalidaria nada, mas
    // manda o sinal errado para quem receber o link.
    if (existing?.passwordHash) {
      console.log(`· ${person.name}: já entrou, nada a fazer.`);
      continue;
    }

    const invite = newInviteToken();
    let id = existing?.id;

    if (!dry) {
      if (id) {
        await db
          .update(users)
          .set({ inviteTokenHash: invite.hash, inviteExpiresAt: invite.expiresAt })
          .where(eq(users.id, id));
      } else {
        const [created] = await db
          .insert(users)
          .values({
            orgId,
            name: person.name,
            email: person.email,
            jobTitle: person.jobTitle,
            role: person.role,
            isMaster: person.isMaster ?? false,
            passwordHash: null,
            inviteTokenHash: invite.hash,
            inviteExpiresAt: invite.expiresAt,
          })
          .returning({ id: users.id });
        id = created.id;
      }

      // Admin já enxerga tudo; vínculo explícito só confundiria a tela.
      if (person.role !== "admin" && id) {
        await db.delete(userCompanyAccess).where(eq(userCompanyAccess.userId, id));
        await db
          .insert(userCompanyAccess)
          .values(parents.map((c) => ({ userId: id as string, companyId: c.id })));
      }
    }

    const url = inviteUrl(base, invite.token);
    const verb = existing ? "convite renovado" : "criada";

    /*
     * Envia dentro do laco, e nao numa segunda passada no fim. Se o SMTP cair
     * no meio, quem ja recebeu recebeu — e o console diz exatamente onde
     * parou. Guardar tudo para mandar no fim transformaria uma falha parcial
     * em "ninguem recebeu".
     */
    let entrega = "";
    if (enviar && !dry) {
      const mensagem = inviteEmail({
        name: person.name,
        inviterName: quemConvida,
        url,
        expiresAt: invite.expiresAt,
      });
      const r = await sendMail({ to: person.email, ...mensagem });
      entrega = r.sent ? " — enviado" : ` — NAO ENVIOU: ${r.reason}`;
    }

    console.log(`· ${person.name} — ${person.jobTitle} — ${person.role} (${verb})${entrega}`);
    links.push(`${person.name}\n  ${person.email}\n  ${url}`);
  }

  /* -------------------------------------------------------------- avulsos */

  const orphans = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.orgId, orgId), isNull(users.passwordHash)));

  console.log("\n---------------- links de convite ----------------\n");
  console.log(links.join("\n\n") || "(nenhum)");
  console.log("\n--------------------------------------------------");
  console.log("Cada link vale 7 dias e serve uma vez. Mande um para cada pessoa.");
  if (orphans.length && !dry) {
    console.log(`Aguardando primeiro acesso: ${orphans.length} pessoa(s).`);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
