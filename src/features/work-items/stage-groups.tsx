"use client";

import { useSyncExternalStore } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ItemRow, type RowItem } from "./item-row";
import { StagePill } from "./stage-pill";

export type GroupStage = { id: string; name: string; slug: string; type: string };

const CHAVE = "mkt-hub:etapas-recolhidas";

/**
 * Quais grupos estão recolhidos, lembrado no navegador.
 *
 * Como store externa, e não como estado hidratado dentro de um efeito: ler o
 * armazenamento e chamar `setState` na montagem funciona, mas desenha a tela
 * duas vezes toda vez que ela abre — e é o começo do render em cascata. Aqui o
 * servidor devolve "nada recolhido", o cliente devolve o que estiver salvo, e
 * o React concilia os dois sozinho.
 */
const VAZIO: string[] = [];
let cache: string[] | null = null;
const ouvintes = new Set<() => void>();

function ler(): string[] {
  if (cache) return cache;
  try {
    const salvo = window.localStorage.getItem(CHAVE);
    cache = salvo ? (JSON.parse(salvo) as string[]) : VAZIO;
  } catch {
    // Aba anônima ou armazenamento bloqueado: segue com tudo aberto.
    cache = VAZIO;
  }
  return cache;
}

function alternar(id: string) {
  const atual = ler();
  // Referência nova a cada mudança, senão o React não vê que mudou.
  cache = atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id];
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(cache));
  } catch {
    // Não poder lembrar não pode impedir de recolher agora.
  }
  for (const ouvinte of ouvintes) ouvinte();
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

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
  const collapsed = useSyncExternalStore(assinar, ler, () => VAZIO);

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
              onClick={() => alternar(stage.id)}
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
