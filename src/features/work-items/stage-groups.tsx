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
  today,
  runningItemId,
}: {
  stages: GroupStage[];
  items: Array<RowItem & { stageId: string }>;
  today: string;
  runningItemId: string | null;
}) {
  const collapsed = useCollapsed(recolhidas);

  const visible = stages.filter(
    (stage) => stage.type === "task" || items.some((item) => item.stageId === stage.id),
  );

  return (
    <div className="flex flex-col gap-3">
      {visible.map((stage) => {
        const list = items.filter((item) => item.stageId === stage.id);
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
              <span className="tnum text-[12px] text-faint">{list.length}</span>
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
          </section>
        );
      })}
    </div>
  );
}
