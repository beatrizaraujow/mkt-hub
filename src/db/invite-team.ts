/**
 * Cadastro inicial do time, por convite.
 *
 * Uma pessoa:
 *
 *   npm run invite -- ../mkt-prod.env nome="Igor Freire" email=igor@seubone.com
 *   npm run invite -- ../mkt-prod.env nome="..." email=... papel=gestor cargo="Diretor"
 *
 * O time inteiro, como no cadastro inicial de 25/08/2026:
 *
 *   npm run invite -- ../mkt-prod.env
 *   npm run invite -- dry            simula, no banco de desenvolvimento
 *   npm run invite -- ... enviar     manda por e-mail tambem
 *
 * **As opcoes sao `chave=valor` e palavra solta, sem tracos.** No PowerShell
 * tudo que comeca com `--` some antes de chegar aqui — ver `ligado` e `valorDe`
 * em `destino`. E ele diz em qual banco vai escrever antes de escrever.
 *
 * Sem `enviar` ele so imprime os links, como sempre fez. O envio e opcional de
 * proposito: o dia em que o SMTP estiver fora, este script precisa continuar
 * servindo para desbloquear o time — e em producao o SMTP esta fora hoje.
 *
 * Faz o mesmo que a tela de Time: cria a pessoa **sem senha**, gera o convite e
 * imprime o link. A senha é definida pela própria pessoa.
 *
 * É idempotente: quem já existe não é recriado. Rodar de novo só gera convite
 * novo para quem ainda não entrou — o que também serve para reenviar.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { companies, userCompanyAccess, users, userRole, type UserRole } from "@/db/schema";
import { inviteUrl, newInviteToken } from "@/lib/invite";
import { mailConfigured, sendMail } from "@/lib/mail";
import { inviteEmail } from "@/features/people/invite-email";
import { anunciarDestino, lerAmbienteDoArgumento, ligado, valorDe } from "./destino";

/*
 * As opcoes saem da linha antes de o ambiente ser lido, e o cliente nasce aqui
 * e nao em `@/db`: em ESM os imports sao avaliados antes das instrucoes, entao
 * importar o cliente comum prenderia este script ao `.env.local` — e um
 * `../mkt-prod.env` na linha de comando seria ignorado em silencio, que foi o
 * defeito corrigido no `sync-clickup` em 02/09/2026.
 */
const dry = ligado("dry");
const enviar = ligado("enviar");
const nomeArg = valorDe("nome");
const emailArg = valorDe("email")?.trim().toLowerCase();
const papelArg = valorDe("papel");
const cargoArg = valorDe("cargo");
const baseArg = valorDe("base");
const quemConvida = valorDe("de") ?? "Anny Beatriz";

lerAmbienteDoArgumento();
anunciarDestino();

const client = postgres(process.env.DATABASE_URL as string, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  onnotice: () => {},
});

const db = drizzle(client, { schema });

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

/**
 * Quem vai ser convidado nesta rodada.
 *
 * Sem `email=` e a lista do time, como sempre foi. Com `email=`, e uma pessoa
 * so — que e o caso de longe mais comum depois do cadastro inicial, e que ate
 * 02/09/2026 obrigava a editar este arquivo para convidar alguem.
 */
function aConvidar(): Person[] {
  if (!emailArg) return TEAM;

  if (!nomeArg || nomeArg.trim().length < 2) {
    console.error('Falta o nome. Ex.: nome="Igor Freire"');
    process.exit(1);
  }

  const papel = (papelArg ?? "colaborador") as UserRole;
  if (!userRole.enumValues.includes(papel)) {
    console.error(`Papel invalido: ${papel}. Use ${userRole.enumValues.join(" | ")}.`);
    process.exit(1);
  }

  return [{ name: nomeArg.trim(), email: emailArg, jobTitle: cargoArg ?? "", role: papel }];
}

async function main() {
  /*
   * `||` e nao `??`: a `APP_URL` existe vazia no `.env.local`, e `??` so cai
   * para o padrao quando o valor e nulo. Com `??` o link saia como
   * `/convite/<token>`, sem endereco nenhum — um link que nao abre em lugar
   * nenhum e pior que link faltando, porque parece pronto.
   */
  const base = baseArg?.trim() || process.env.APP_URL?.trim() || "https://www.mkthub.space";
  const pessoas = aConvidar();

  if (enviar && !mailConfigured()) {
    console.error("Pediu `enviar` mas falta a configuracao de SMTP. Veja o .env.example.");
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

  /*
   * Conserto de uma vez so, do cadastro inicial. Nao roda quando o convite e de
   * uma pessoa: mexer no e-mail de outra gente enquanto se convida alguem seria
   * um efeito colateral que ninguem pediu.
   */
  const [old] = emailArg
    ? []
    : await db.select().from(users).where(eq(users.email, RENAME.from)).limit(1);
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

  for (const person of pessoas) {
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

    const cargo = person.jobTitle ? ` — ${person.jobTitle}` : "";
    console.log(`· ${person.name}${cargo} — ${person.role} (${verb})${entrega}`);
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
