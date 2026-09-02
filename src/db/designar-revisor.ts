/**
 * Quem vê o Revisor sem ser gestor.
 *
 *   npm run revisor:designar                              lista quem está designado
 *   npm run revisor:designar -- klenio@... --aplicar       designa
 *   npm run revisor:designar -- klenio@... --tirar --aplicar   remove
 *
 * Para produção, com o arquivo de conexão junto:
 *
 *   npm run revisor:designar -- ../mkt-prod.env klenio@... --aplicar
 *
 * O e-mail e o caminho vêm os dois como argumento solto, e se distinguem pelo
 * `@`: caminho de arquivo não tem, e-mail sempre tem. Pedir um flag para o
 * e-mail seria mais explícito e não funciona — o npm engole flags depois do
 * `--`, foi assim que `--env` sumiu em 01/09/2026.
 *
 * **Isto não muda o papel de ninguém.** Designar dá acesso à lista e aos
 * pareceres do Revisor; Regras e Medição continuam de gestor, porque são as
 * telas que decidem como o time inteiro é avaliado.
 */
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { anunciarDestino, lerAmbienteDoArgumento, ligado } from "./destino";
import { organizations, reviewSettings, users } from "./schema";

const CHAVE = "revisores_designados";

/*
 * As palavras de opcao saem da linha antes de o ambiente ser lido: quem le o
 * arquivo de ambiente pega o primeiro argumento solto, e sem esta ordem um
 * `-- aplicar` sozinho tentaria abrir um arquivo com esse nome.
 */
const aplicar = ligado("aplicar");
const tirar = ligado("tirar");

lerAmbienteDoArgumento();
anunciarDestino();

const client = postgres(process.env.DATABASE_URL as string, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
});
const db = drizzle(client);

async function main() {
  const email = process.argv.slice(2).find((a) => !a.startsWith("--") && a.includes("@"));

  const [org] = await db.select().from(organizations).limit(1);
  if (!org) throw new Error("Nenhuma organizacao neste banco.");

  const [linha] = await db
    .select({ value: reviewSettings.value })
    .from(reviewSettings)
    .where(and(eq(reviewSettings.orgId, org.id), eq(reviewSettings.key, CHAVE)))
    .limit(1);

  const atuais: string[] = Array.isArray(linha?.value) ? (linha.value as string[]) : [];

  const todos = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.orgId, org.id));

  const nomeDe = new Map(todos.map((u) => [u.id, `${u.name} <${u.email}>`]));

  console.log(`\nDesignados hoje: ${atuais.length || "nenhum"}`);
  for (const id of atuais) console.log(`  · ${nomeDe.get(id) ?? `${id} (conta não existe mais)`}`);

  if (!email) {
    console.log("\nPasse um e-mail para designar. Gestores já entram sem estar nesta lista:");
    for (const u of todos.filter((x) => x.role === "admin" || x.role === "gestor")) {
      console.log(`  · ${u.name} (${u.role})`);
    }
    return;
  }

  const pessoa = todos.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!pessoa) throw new Error(`Nao achei conta com o e-mail ${email}.`);

  if (pessoa.role === "admin" || pessoa.role === "gestor") {
    console.log(`\n${pessoa.name} é ${pessoa.role} e já vê o Revisor. Nada a fazer.`);
    return;
  }

  const novos = tirar
    ? atuais.filter((id) => id !== pessoa.id)
    : [...new Set([...atuais, pessoa.id])];

  if (novos.length === atuais.length && !tirar) {
    console.log(`\n${pessoa.name} já está designado. Nada a fazer.`);
    return;
  }

  console.log(`\n${tirar ? "-" : "+"} ${pessoa.name} <${pessoa.email}>  (papel ${pessoa.role}, inalterado)`);

  if (!aplicar) {
    console.log("\nSimulacao — nada foi escrito. Use --aplicar.");
    return;
  }

  await db
    .insert(reviewSettings)
    .values({ orgId: org.id, key: CHAVE, value: novos })
    .onConflictDoUpdate({
      target: [reviewSettings.orgId, reviewSettings.key],
      set: { value: novos, updatedAt: new Date() },
    });

  console.log(`\nGravado. Agora sao ${novos.length}.`);
}

main()
  .then(() => client.end())
  .catch(async (erro) => {
    console.error(erro);
    process.exitCode = 1;
    await client.end().catch(() => {});
  });
