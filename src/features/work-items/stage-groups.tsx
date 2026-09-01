"use client";

import { ChevronRight } from "lucide-react";
import { createCollapseStore, useCollapsed } from "@/lib/collapse-store";
import { cn } from "@/lib/utils";
import { ItemRow, type RowItem } from "./item-row";
import { StagePill } from "./stage-pill";

export type GroupStage = { id: string; name: string; slug: string; type: string };

const recolhidas = createCollapseStore("mkt-hub:etapas-recolhidas");

/**
 * De qual fluxo o grupo veio.
 *
 * Só aparece fora de tarefa: "Solicitado" existe no pipeline de tarefa e no de
 * captação, e dois grupos com o mesmo nome, um embaixo do outro, não dizem qual
 * é qual. Repetir "Tarefa" nas onze linhas do fluxo principal seria ruído.
 */
const PIPELINE_LABEL: Record<string, string> = {
  content: "Conteúdo",
  capture: "Captação",
};

/**
 * A lista agrupada por etapa.
 *
 * Grupo vazio continua aparecendo, com contagem zero: uma etapa que some
 * quando esvazia esconde justamente o que está faltando fazer. Só as etapas
 * do pipeline de tarefa aparecem sempre; as de conteúdo e captação entram
 * quando têm item, senão a tela ganharia onze cabeçalhos vazios de fluxos que
 * o time quase não usa.
 */
export function StageGroups({
  stages,
  items,
  totais,
  today,
  runningItemId,
}: {
  stages: GroupStage[];
  items: Array<RowItem & { stageId: string }>;
  /**
   * Quantas tarefas cada etapa tem no banco.
   *
   * Nao se conta `items`: ele traz no maximo as primeiras de cada etapa, e usar
   * o tamanho dele como total faz o limite de pagina virar numero exibido.
   */
  totais: Map<string, number>;
  today: string;
  runningItemId: string | null;
}) {
  const collapsed = useCollapsed(recolhidas);

  const visible = stages.filter(
    (stage) => stage.type === "task" || (totais.get(stage.id) ?? 0) > 0,
  );

  return (
    <div className="flex flex-col gap-3">
      {visible.map((stage) => {
        const list = items.filter((item) => item.stageId === stage.id);
        const total = totais.get(stage.id) ?? list.length;
        const cortada = total > list.length;
        const open = !collapsed.includes(stage.id);

        return (
          <section key={stage.id}>
            <button
              type="button"
              onClick={() => recolhidas.alternar(stage.id)}
              aria-expanded={open}
              className="flex w-full items-center gap-2 py-1.5 text-left"
            >
              <ChevronRight
                size={14}
                strokeWidth={2.5}
                aria-hidden
                className={cn(
                  "shrink-0 text-faint transition-transform duration-150",
                  open && "rotate-90",
                )}
              />
              <StagePill name={stage.name} slug={stage.slug} />
              {PIPELINE_LABEL[stage.type] ? (
                <span className="text-[11px] uppercase tracking-[0.06em] text-faint">
                  {PIPELINE_LABEL[stage.type]}
                </span>
              ) : null}
              <span className="tnum text-[12px] text-faint">{total}</span>
            </button>

            {open &&
              (list.length === 0 ? (
                <p className="rounded-[var(--radius-card)] border border-dashed border-line px-3 py-3 text-[12.5px] text-faint">
                  Nada nesta etapa.
                </p>
              ) : (
                <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
                  {list.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      today={today}
                      showAssignee
                      runningItemId={runningItemId}
                    />
                  ))}
                </div>
              ))}

            {open && cortada && (
              /*
               * Quando a etapa tem mais do que coube, o numero do cabecalho e o
               * total e a lista e um pedaco dele. Dizer isso e obrigatorio: sem
               * a linha, a etapa parece completa e quem procura uma tarefa que
               * existe conclui que ela sumiu.
               */
              <p className="px-3 py-1.5 text-[11.5px] text-faint">
                mostrando <span className="tnum">{list.length}</span> de{" "}
                <span className="tnum">{total}</span> — refine por empresa ou responsavel para ver
                as demais
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
