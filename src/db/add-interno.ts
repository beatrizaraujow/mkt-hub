/**
 * Cria a empresa **Interno**, que recebe o trabalho sem cliente.
 *
 *   npm run empresa:interno               simula
 *   npm run empresa:interno -- --aplicar  escreve
 *
 * Nasceu da migracao do ClickUp em 31/08/2026. Setecentas e setenta tarefas do
 * board nao tem `Empresa Tag`, nem elas nem a mae — e nao e descuido de
 * cadastro: sao anotacoes internas ("Artes vagas 17.08", "mudar o catalogo em
 * todas as LPS"), trabalho que existiu e nao pertence a cliente nenhum.
 *
 * Como `company_id` e obrigatorio, sem esta empresa aquelas 770 nao entrariam —
 * e junto com elas ficariam de fora 751 conclusoes, 510 pontuacoes e 1.215
 * horas. Numa migracao que desliga o ClickUp, isso nao e filtrar: e perder.
 *
 * **Nao e um deposito para o que nao se soube classificar.** O que tem cliente
 * continua indo para o cliente; aqui fica o que nao tem. Quem quiser reclassi-
 * ficar depois, reclassifica — a tarefa existe, com responsavel, ponto e hora.
 *
 * Cor cinza de proposito: as outras cinco sao cores de marca, e usar uma sexta
 * cor de marca para algo que nao e marca confundiria a leitura do quadro.
 */
import { and, eq } from "drizzle-orm";
import { client, db } from "./index";
import { companies, organizations } from "./schema";
import { ligado } from "./destino";

const INTERNO = {
  name: "Interno",
  slug: "interno",
  color: "#6b7472",
};

async function main() {
  const aplicar = ligado("aplicar");

  const [org] = await db.select().from(organizations).limit(1);
  if (!org) throw new Error("Nenhuma organizacao. Rode `npm run seed` antes.");

  const [existente] = await db
    .select({ id: companies.id, nome: companies.name })
    .from(companies)
    .where(and(eq(companies.orgId, org.id), eq(companies.slug, INTERNO.slug)))
    .limit(1);

  if (existente) {
    console.log(`= "${existente.nome}" ja existe (${existente.id}). Nada a fazer.`);
    return;
  }

  console.log(`+ ${INTERNO.name} (${INTERNO.slug}) — ${INTERNO.color}`);

  if (!aplicar) {
    console.log("\nSimulacao — nada foi escrito. Use -- --aplicar.");
    return;
  }

  const [criada] = await db
    .insert(companies)
    .values({ orgId: org.id, ...INTERNO })
    .returning({ id: companies.id });

  console.log(`\nCriada: ${criada.id}`);
}

main()
  .then(() => client.end())
  .catch(async (erro) => {
    console.error(erro);
    /*
     * O codigo de saida e marcado **antes** de esperar o fim da conexao. Com o
     * banco fora de alcance, `client.end()` pode nunca resolver — o `await`
     * abaixo trava, o `process.exit(1)` nunca roda, e o Node encerra sozinho
     * com codigo 0 quando o event loop esvazia. O erro aparece na tela e o
     * processo se declara bem-sucedido; quem chama este script em sequencia
     * segue para o passo seguinte como se nada tivesse acontecido.
     */
    process.exitCode = 1;
    await client.end().catch(() => {});
    process.exit(1);
  });
