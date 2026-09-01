/**
 * Alinha a etapa das tarefas ja importadas com o board do ClickUp.
 *
 *   npm run clickup:baixar
 *   npm run clickup:sincronizar               simula, nao escreve
 *   npm run clickup:sincronizar -- --aplicar  escreve
 *
 * **Aponta para desenvolvimento** (le `.env.local`). Para producao, sobrescreva
 * `DATABASE_URL` no ambiente e confira o **usuario** da conexao, nunca o host.
 *
 * Existe porque o import so insere. Enquanto os dois sistemas convivem, o time
 * move o cartao la e o Hub continua mostrando o estado do dia do import — em
 * tres dias, 51 das 258 tarefas ja divergiam. Isso deixa de ser necessario no
 * dia em que a data de corte existir: dali em diante o Hub e a verdade, e nao
 * ha de onde divergir.
 *
 * **Nunca usa `now()` como data de conclusao.** Uma tarefa fechada no ClickUp
 * em junho, sincronizada hoje com a data de hoje, entraria inteira na semana
 * corrente: meses de trabalho antigo somando na pontuacao desta semana, com
 * cara de recorde. A data vem do proprio ClickUp — `date_closed` quando existe,
 * e a ultima movimentacao quando a etapa e de fim mas o card nao foi fechado.
 *
 * So mexe em `stage_id` e `completed_at`. Titulo, responsavel, prazo e ponto
 * podem ter sido corrigidos aqui depois do import, e sobrescrever isso com o
 * board apagaria o trabalho de quem corrigiu.
 */
import fs from "node:fs";
import { eq, sql } from "drizzle-orm";
import { client, db } from "./index";
import { activityLog, workItemStages, workItems } from "./schema";
import { ETAPAS_DE_FIM, etapaDe } from "@/features/work-items/clickup-map";
import { podeAtravessar } from "@/lib/esteira";
import { motivoValido } from "@/lib/excecao";

const ORIGEM = process.env.CLICKUP_JSON ?? "./.cu-limpo.json";

type Bruta = {
  id: string;
  nome: string;
  status: string;
  fechada?: string | null;
  atualizada?: string | null;
};

/** A data de conclusao de uma peca que chegou numa etapa de fim. */
function concluidaEm(tarefa: Bruta): Date | null {
  const carimbo = tarefa.fechada ?? tarefa.atualizada;
  return carimbo ? new Date(Number(carimbo)) : null;
}

async function main() {
  const aplicar = process.argv.includes("--aplicar");

  if (!fs.existsSync(ORIGEM)) {
    console.error(`Nao achei ${ORIGEM}. Rode antes: npm run clickup:baixar`);
    process.exit(1);
  }

  const brutas: Bruta[] = JSON.parse(fs.readFileSync(ORIGEM, "utf-8"));
  const noBoard = new Map(brutas.map((t) => [t.id, t]));

  const etapas = await db
    .select({ id: workItemStages.id, slug: workItemStages.slug, name: workItemStages.name })
    .from(workItemStages)
    .where(eq(workItemStages.type, "task"));
  const porSlug = new Map(etapas.map((e) => [e.slug, e]));

  const aqui = await db
    .select({
      id: workItems.id,
      orgId: workItems.orgId,
      title: workItems.title,
      stageId: workItems.stageId,
      completedAt: workItems.completedAt,
      parentId: workItems.parentId,
      reviewExempt: workItems.reviewExempt,
      reviewExemptReason: workItems.reviewExemptReason,
      meta: workItems.meta,
    })
    .from(workItems)
    .where(sql`${workItems.meta}->>'origem' = 'clickup'`);

  const porId = new Map(etapas.map((e) => [e.id, e]));

  let mudadas = 0;
  let sumiram = 0;
  const recusadas: Array<{ titulo: string; de: string; para: string; motivo: string }> = [];
  const desconhecidos = new Set<string>();

  for (const item of aqui) {
    const clickupId = (item.meta as { clickupId?: string })?.clickupId;
    const tarefa = clickupId ? noBoard.get(clickupId) : undefined;

    // Some do board quando alguem apaga ou arquiva la. Nao apago aqui: apagar
    // levaria junto tempo lancado, comentario e historico.
    if (!tarefa) {
      sumiram++;
      continue;
    }

    const slugAlvo = etapaDe(tarefa.status);
    if (!slugAlvo) {
      desconhecidos.add(tarefa.status);
      continue;
    }

    const atual = porId.get(item.stageId);
    if (atual?.slug === slugAlvo) continue;

    const destino = porSlug.get(slugAlvo);
    if (!destino) throw new Error(`Etapa ${slugAlvo} nao existe no pipeline de tarefa.`);

    /*
     * A esteira vale para a sincronizacao tambem, e nao e detalhe.
     *
     * O board do ClickUp nao conhece pre revisao nem revisao IA como obrigacao:
     * la alguem arrasta de "Em progresso" para "Aprovar" e pronto. Deixar a
     * sincronizacao espelhar isso abriria, por automacao, exatamente a porta
     * lateral que a tela fecha — e por uma porta que ninguem esta olhando,
     * porque roda por comando e nao por clique.
     *
     * Recusar aqui deixa a tarefa parada onde esta, com a divergencia visivel
     * no fim do relatorio. Divergencia visivel e melhor que atalho silencioso.
     */
    const passagem = podeAtravessar({
      de: atual?.slug,
      para: slugAlvo,
      ehSubtarefa: item.parentId !== null,
      isento: item.reviewExempt,
      temMotivo: motivoValido(item.reviewExemptReason),
    });

    if (!passagem.ok) {
      recusadas.push({ titulo: item.title, de: atual?.name ?? "?", para: destino.name, motivo: passagem.motivo });
      continue;
    }

    const fim = ETAPAS_DE_FIM.has(slugAlvo);
    const conclusao = fim ? (item.completedAt ?? concluidaEm(tarefa)) : null;

    console.log(
      `  ${item.title.slice(0, 46).padEnd(46)} ${atual?.name ?? "?"} -> ${destino.name}` +
        (fim && conclusao ? ` (concluida em ${conclusao.toISOString().slice(0, 10)})` : ""),
    );

    if (aplicar) {
      await db
        .update(workItems)
        .set({ stageId: destino.id, completedAt: conclusao })
        .where(eq(workItems.id, item.id));

      /*
       * Registra no historico. Mudanca de etapa sem linha no historico e
       * exatamente o que o painel promete que nunca acontece — e daqui a um mes
       * alguem vai perguntar por que o cartao andou sozinho.
       */
      await db.insert(activityLog).values({
        orgId: item.orgId,
        workItemId: item.id,
        actorId: null,
        action: "item.stage_changed",
        payload: {
          de: atual?.name ?? null,
          para: destino.name,
          por: "sincronização com o ClickUp",
        },
      });
    }

    mudadas++;
  }

  console.log(
    `\n${aplicar ? "Aplicado." : "Simulacao — nada foi escrito. Use -- --aplicar."}` +
      `\n  vindas do ClickUp: ${aqui.length}   etapa alinhada: ${mudadas}   nao estao mais no board: ${sumiram}` +
      `   recusadas pela esteira: ${recusadas.length}`,
  );
  for (const s of desconhecidos) console.log(`  ! status sem de-para: "${s}"`);

  if (recusadas.length > 0) {
    console.log("\nEstas o ClickUp moveu e a esteira nao deixa acompanhar. Ficaram onde estavam:");
    for (const r of recusadas) {
      console.log(`  ${r.titulo.slice(0, 46).padEnd(46)} ${r.de} -> ${r.para}`);
      console.log(`    ${r.motivo}`);
    }
  }
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
