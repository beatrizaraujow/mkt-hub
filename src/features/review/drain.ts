import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reviewCycles } from "@/db/schema";
import { runGate } from "./gate";
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
  const report: DrainReport = { expiradas: 0, processadas: 0, incompletas: 0, falhas: 0 };

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
       * Daqui em diante entra o julgamento, que ainda não existe: as regras da
       * Carbone precisam ser classificadas em máquina / pessoa / fora de
       * escopo antes, senão o parecer seria chute.
       *
       * Falha sem repetir de propósito. Tentar três vezes o que não está
       * escrito só enche o log e atrasa a fila. E o ciclo termina em `falhou`,
       * nunca em veredito — que é a regra que não se quebra.
       */
      await failRun(run, "Julgamento ainda não implementado: faltam as regras classificadas.", {
        retry: false,
      });
      report.falhas += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido.";
      const { retried } = await failRun(run, message);
      if (!retried) report.falhas += 1;
    }
  }

  return report;
}
