"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDueDate, startOfBrtDay } from "@/lib/date";
import { canLeaveStage } from "@/lib/stages";
import { setStage } from "./actions";
import { StagePill } from "./stage-pill";
import { ReasonPrompt } from "./reason-prompt";
import { needsReason } from "./rework";
import { useOpenItem } from "./use-open-item";
import type { UserRole } from "@/db/schema";
import type { RowItem } from "./item-row";

export type BoardStage = { id: string; name: string; slug: string; kind: string; position: number };
export type BoardItem = RowItem & { stageId: string };

const PRIORITY_COLOR: Record<RowItem["priority"], string> = {
  urgente: "var(--p-urgente)",
  alta: "var(--p-alta)",
  media: "var(--p-media)",
  baixa: "var(--p-baixa)",
};

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function Card({ item, today }: { item: BoardItem; today: string }) {
  const open = useOpenItem();
  const overdue =
    !item.completedAt && item.dueDate !== null && item.dueDate < startOfBrtDay(today);

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", item.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "cursor-grab rounded-[var(--radius-control)] border border-line bg-surface p-2.5",
        "transition-colors duration-150 hover:border-line-strong active:cursor-grabbing",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          style={{ background: PRIORITY_COLOR[item.priority] }}
          className="mt-[3px] h-3 w-[3px] shrink-0 rounded-full"
        />
        <button
          type="button"
          onClick={() => open(item.id)}
          className="min-w-0 flex-1 text-left text-[13px] leading-snug text-ink"
        >
          {item.title}
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2 pl-[11px]">
        <span
          aria-hidden
          style={{ background: item.companyColor }}
          className="h-1.5 w-1.5 shrink-0 rounded-full"
        />
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-faint">
          {item.companyName}
        </span>

        {item.dueDate ? (
          <span
            className={cn("tnum shrink-0 text-[11.5px]", overdue ? "text-danger" : "text-faint")}
          >
            {formatDueDate(item.dueDate, today)}
          </span>
        ) : null}

        <span
          title={item.assigneeName ?? "Sem responsável"}
          className={cn(
            "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[9px] font-semibold",
            item.assigneeName ? "bg-accent-soft text-accent" : "bg-sunk text-faint",
          )}
        >
          {item.assigneeName ? initials(item.assigneeName) : "—"}
        </span>
      </div>
    </article>
  );
}

export function Board({
  stages,
  items,
  today,
  role,
}: {
  stages: BoardStage[];
  items: BoardItem[];
  today: string;
  /** Só para avisar antes; quem recusa de verdade é o servidor. */
  role: UserRole;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  /** Arraste que reprovou uma entrega e espera o motivo. */
  const [askFor, setAskFor] = useState<{ id: string; title: string; stage: BoardStage } | null>(
    null,
  );

  // A coluna muda na hora; se o servidor recusar, volta sozinho.
  const [shown, moveOptimistic] = useOptimistic(
    items,
    (current: BoardItem[], move: { id: string; stageId: string }) =>
      current.map((i) => (i.id === move.id ? { ...i, stageId: move.stageId } : i)),
  );

  function move(id: string, stageId: string, reason?: string) {
    setError(null);
    start(async () => {
      moveOptimistic({ id, stageId });
      const result = await setStage(id, stageId, reason);
      if (result.error) setError(result.error);
    });
  }

  function drop(stageId: string, id: string) {
    setOver(null);
    const item = shown.find((i) => i.id === id);
    if (!item || item.stageId === stageId) return;

    const to = stages.find((s) => s.id === stageId);
    const from = stages.find((s) => s.id === item.stageId);
    if (to && needsReason(from, to)) {
      // Sem mover o cartao: se a pessoa desistir, nada mudou.
      setAskFor({ id, title: item.title, stage: to });
      return;
    }

    move(id, stageId);
  }

  return (
    <div className="relative">
      {askFor && (
        <ReasonPrompt
          itemTitle={askFor.title}
          stageName={askFor.stage.name}
          pending={pending}
          onCancel={() => setAskFor(null)}
          onConfirm={(reason) => {
            const target = askFor;
            setAskFor(null);
            move(target.id, target.stage.id, reason);
          }}
        />
      )}

      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-[var(--radius-control)] border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger"
        >
          {error} O cartão voltou para a etapa de origem.
        </p>
      ) : null}

      <div
        /*
          `items-start` e o que impede coluna vazia de esticar. Sem isso o flex
          alinha por `stretch` e as onze colunas ficam todas com a altura da
          mais cheia — a de Aprovacao, com cinquenta e seis cartoes, obrigava
          "vazio" a ocupar uma tela inteira de nada.
        */
        // O cartao ja se move na hora; apagar o quadro inteiro so atrapalha.
        className="scroll-thin flex items-start gap-3 overflow-x-auto pb-3"
      >
        {stages.map((stage) => {
          const list = shown.filter((i) => i.stageId === stage.id);

          return (
            <section
              key={stage.id}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== stage.id) setOver(stage.id);
              }}
              onDragLeave={() => setOver((c) => (c === stage.id ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                drop(stage.id, e.dataTransfer.getData("text/plain"));
              }}
              className={cn(
                /*
                  Teto na altura da janela, e a lista rola por dentro. Sem
                  teto, uma coluna cheia estica a pagina inteira e as outras
                  dez viram um rastro de espaco vazio ao lado dela.

                  O desconto cobre o cabecalho da tela, a barra de filtros e o
                  respiro de baixo. Coluna com pouco cartao continua do tamanho
                  do que tem: o teto limita, nao estica.
                */
                "flex max-h-[calc(100dvh-13rem)] w-[264px] shrink-0 flex-col rounded-[var(--radius-card)] border bg-sunk p-2",
                over === stage.id ? "border-accent" : "border-line",
              )}
            >
              {/*
                Fora da area que rola, entao a etapa fica visivel o tempo todo
                sem precisar de `sticky`: quem rola os cartoes nao perde de
                vista em que coluna esta.
              */}
              <header className="-mx-2 -mt-2 mb-2 flex shrink-0 items-center gap-2 rounded-t-[var(--radius-card)] bg-sunk px-3 py-2">
                <StagePill name={stage.name} slug={stage.slug} size="sm" />
                <span className="tnum text-[11.5px] text-faint">{list.length}</span>
                {!canLeaveStage(role, stage.slug) && (
                  <Lock
                    size={12}
                    aria-label="Só a liderança tira item desta etapa"
                    className="ml-auto text-faint"
                  />
                )}
              </header>

              <div className="scroll-thin -mx-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1">
                {list.map((item) => (
                  <Card key={item.id} item={item} today={today} />
                ))}

                {list.length === 0 && (
                  <p className="rounded-[var(--radius-control)] border border-dashed border-line px-2 py-4 text-center text-[12px] text-faint">
                    vazio
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-1 text-[12px] text-faint">
        Arraste um cartão para mudar de etapa. No celular, use a lista.
      </p>
    </div>
  );
}
