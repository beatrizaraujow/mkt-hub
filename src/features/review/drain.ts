import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reviewCycles } from "@/db/schema";
import { runGate } from "./gate";
import { judgeCycle } from "./judge";
import { ModelError } from "./model";
import {
  BATCH_SIZE,
  claimRuns,
  failRun,
  finishRun,
  markIncomplete,
  markRunning,
  reclaimExpired,
} from "./queue";

export type DrainReport = {
  expiradas: number;
  processadas: number;
  incompletas: number;
  /** Ciclos que terminaram com parecer emitido. */
  pareceres: number;
  achados: number;
  /** Achados que citaram regra inexistente e foram jogados fora. */
  descartados: number;
  falhas: number;
};

/**
 * Uma passada da fila. É o que o cron chama.
 *
 * A ordem importa: primeiro varre reserva vencida, senão execução de processo
 * morto fica parada para sempre; depois pega o lote novo.
 *
 * Nada aqui decide veredito por conta própria. Se o porteiro barra, o ciclo
 * fica `incompleto` com o motivo escrito. Se algo quebra, fica `falhou`. O
 * sistema não aprova por otimismo nem reprova por precaução.
 */
export async function drainReviewQueue(limit = BATCH_SIZE): Promise<DrainReport> {
  const report: DrainReport = {
    expiradas: 0,
    processadas: 0,
    incompletas: 0,
    pareceres: 0,
    achados: 0,
    descartados: 0,
    falhas: 0,
  };

  for (const expired of await reclaimExpired()) {
    report.expiradas += 1;
    const { retried } = await failRun(expired, "Reserva expirou antes de terminar.");
    if (!retried) report.falhas += 1;
  }

  for (const run of await claimRuns(limit)) {
    report.processadas += 1;

    try {
      const [cycle] = await db
        .select()
        .from(reviewCycles)
        .where(eq(reviewCycles.id, run.cycleId))
        .limit(1);

      if (!cycle) {
        await failRun(run, "O ciclo sumiu.", { retry: false });
        report.falhas += 1;
        continue;
      }

      await markRunning(cycle.id);

      // Barato e determinístico antes de gastar IA.
      const gate = await runGate(cycle.workItemId);

      if (!gate.ok) {
        await markIncomplete(cycle.id, gate.missing);
        await finishRun(run.id);
        report.incompletas += 1;
        continue;
      }

      /**
       * A partir daqui gasta IA. Tudo que dá errado sobe como erro e vira
       * ciclo `falhou` — nunca veredito. Aprovar por otimismo depois de uma
       * falha de rede é a coisa mais perigosa que este sistema poderia fazer,
       * porque é invisível: ninguém investiga o que passou, só o que barrou.
       */
      const result = await judgeCycle(cycle.id);

      await finishRun(run.id, {
        model: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
      });

      report.pareceres += 1;
      report.achados += result.findings;
      report.descartados += result.discarded;
      continue;
    } catch (error) {
      /**
       * `ModelError` sabe se repetir adianta: chave ausente e pedido
       * malformado não melhoram na terceira tentativa, limite de uso e queda
       * de rede melhoram. O resto é erro nosso e repete.
       */
      const retry = error instanceof ModelError ? error.retry : true;
      const message = error instanceof Error ? error.message : "Erro desconhecido.";
      const { retried } = await failRun(run, message, { retry });
      if (!retried) report.falhas += 1;
    }
  }

  return report;
}
