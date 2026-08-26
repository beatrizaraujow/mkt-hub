"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, RefreshCw, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import { answerChecklist, requestReview } from "./actions";
import type { ReviewPanel } from "./panel-data";

/**
 * O parecer, na tela de quem vai corrigir.
 *
 * A ordem é a de quem lê com pressa: o que reprovou, por qual regra, com o
 * trecho e a correção pronta. Depois o que não deu para conferir. E, sempre, o
 * que a revisão automática **não** olha — porque a suposição de que o robô
 * cuida de tudo é o jeito mais rápido de as regras humanas pararem de ser
 * conferidas por qualquer um.
 */

const VERDICT: Record<string, { label: string; color: string; bg: string }> = {
  aprovado: { label: "Sem violação de regra", color: "var(--success)", bg: "var(--success-soft)" },
  ajustar: { label: "Ajustar", color: "var(--warning)", bg: "var(--warning-soft)" },
  reprovado: { label: "Reprovado", color: "var(--danger)", bg: "var(--danger-soft)" },
};

const STATUS_TEXT: Record<string, string> = {
  pendente: "Na fila.",
  rodando: "Revisando agora.",
  incompleto: "Não deu para revisar:",
  falhou: "A revisão falhou:",
};

export function ReviewCard({
  workItemId,
  panel,
  stageSlug,
}: {
  workItemId: string;
  panel: ReviewPanel;
  stageSlug: string;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const { cycle } = panel;
  const verdict = cycle?.verdict ? VERDICT[cycle.verdict] : null;
  const showChecklist = stageSlug === "aprovacao" && panel.checklist.length > 0;

  // Nada aconteceu e nada vai acontecer aqui: não ocupa espaço na tela.
  if (!cycle && !showChecklist && panel.notChecked.length === 0) return null;

  function retry() {
    setError(null);
    start(async () => {
      const result = await requestReview(workItemId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="label-mono flex items-center gap-2">
        <span>Revisão IA</span>
        {cycle ? <span className="tnum text-faint">rodada {cycle.round}</span> : null}
        {cycle?.isSilent ? (
          <span
            className="rounded-[var(--radius-control)] bg-sunk px-1.5 py-0.5 text-[10.5px] uppercase tracking-[0.06em] text-faint"
            title="Em calibragem: o parecer não move nada sozinho."
          >
            silencioso
          </span>
        ) : null}
        {cycle?.reused ? (
          <span className="text-[11px] text-faint" title="Mesma copy e mesmas regras da rodada anterior.">
            parecer repetido
          </span>
        ) : null}
      </h3>

      {!panel.enabled ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-line px-3 py-2.5 text-[12.5px] text-faint">
          A revisão automática está desligada para esta empresa.
        </p>
      ) : null}

      {cycle && cycle.status !== "emitido" ? (
        <div className="rounded-[var(--radius-card)] border border-line bg-sunk px-3 py-2.5 text-[13px] text-ink">
          <p>{STATUS_TEXT[cycle.status] ?? cycle.status}</p>
          {cycle.gateMissing.length > 0 ? (
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-[12.5px] text-faint">
              {cycle.gateMissing.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {cycle.status === "falhou" && cycle.lastError ? (
            <p className="mt-1.5 text-[12.5px] text-faint">{cycle.lastError}</p>
          ) : null}
          {cycle.status === "falhou" || cycle.status === "incompleto" ? (
            <button
              type="button"
              onClick={retry}
              disabled={busy}
              className="mt-2 flex items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-2 py-1 text-[12.5px] text-ink transition-colors hover:bg-hover disabled:opacity-50"
            >
              <RefreshCw size={12} className={cn(busy && "animate-spin")} />
              Tentar de novo
            </button>
          ) : null}
        </div>
      ) : null}

      {cycle?.escalated ? (
        <p className="flex items-start gap-2 rounded-[var(--radius-card)] border border-warning/40 bg-warning-soft px-3 py-2.5 text-[12.5px] text-ink">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
          <span>
            Terceira reprovação seguida nesta entrega. O sistema parou de decidir — compare as
            rodadas e resolva com uma pessoa.
          </span>
        </p>
      ) : null}

      {verdict ? (
        <div
          className="rounded-[var(--radius-card)] border px-3 py-2"
          style={{ borderColor: verdict.color, background: verdict.bg }}
        >
          <p className="text-[13px] font-medium" style={{ color: verdict.color }}>
            {verdict.label}
          </p>
          <p className="mt-0.5 text-[12px] text-faint">
            {panel.applied.length} regra{panel.applied.length === 1 ? "" : "s"} conferida
            {panel.applied.length === 1 ? "" : "s"}
            {cycle?.isSilent ? " · nada foi movido" : ""}
          </p>
        </div>
      ) : null}

      {panel.findings.map((finding) => (
        <article
          key={finding.id}
          className="rounded-[var(--radius-card)] border border-line bg-surface p-3"
        >
          <header className="flex items-center gap-2">
            <span
              className="rounded-[var(--radius-control)] px-1.5 py-0.5 text-[10.5px] uppercase tracking-[0.05em]"
              style={{
                background: finding.isBlocking ? "var(--danger-soft)" : "var(--warning-soft)",
                color: finding.isBlocking ? "var(--danger)" : "var(--warning)",
              }}
            >
              {finding.ruleCode}
            </span>
            {finding.isBlocking ? (
              <span className="text-[11px] text-faint">inegociável</span>
            ) : null}
          </header>

          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink">{finding.detail}</p>

          {finding.excerpt ? (
            <p className="mt-2 border-l-2 border-line-strong pl-2 text-[12.5px] italic text-faint">
              “{finding.excerpt}”
            </p>
          ) : null}

          {finding.suggestion ? (
            <p className="mt-2 rounded-[var(--radius-control)] bg-sunk px-2 py-1.5 text-[12.5px] text-ink">
              {finding.suggestion}
            </p>
          ) : null}

          <p className="mt-2 text-[11.5px] text-faint">{finding.ruleText}</p>
        </article>
      ))}

      {panel.language.length > 0 ? (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-3">
          <h4 className="label-mono mb-1.5">Português</h4>
          <p className="mb-2 text-[11.5px] text-faint">Não reprova nada. Conserto de segundos.</p>
          <ul className="flex flex-col gap-1.5 text-[12.5px]">
            {panel.language.map((note, index) => (
              <li key={`${note.trecho}-${index}`} className="text-ink">
                <span className="text-faint line-through">{note.trecho}</span>{" "}
                <span aria-hidden>→</span> {note.correcao}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {panel.notVerified.length > 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-line p-3">
          <h4 className="label-mono mb-1.5">Regras que não deu para conferir</h4>
          <ul className="flex flex-col gap-1 text-[12.5px] text-faint">
            {panel.notVerified.map((row) => (
              <li key={row.code}>
                <span className="text-ink">{row.code}</span> — {row.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {panel.overlaps.some((row) => row.applied) ? (
        <p className="text-[11.5px] text-faint">
          Neste recorte,{" "}
          {panel.overlaps
            .filter((row) => row.applied)
            .map((row) => `${row.winner} substituiu ${row.loser}`)
            .join("; ")}
          .
        </p>
      ) : null}

      {showChecklist ? (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-3">
          <h4 className="label-mono mb-1.5">Checklist da aprovação</h4>
          <p className="mb-2 text-[11.5px] text-faint">
            A etapa não avança enquanto faltar item.
          </p>
          <div className="flex flex-col">
            {panel.checklist.map((line) => (
              <button
                key={line.id}
                type="button"
                disabled={busy}
                onClick={() =>
                  start(async () => {
                    const result = await answerChecklist(workItemId, line.id, !line.checked);
                    if (result.error) setError(result.error);
                    else router.refresh();
                  })
                }
                className="group flex items-start gap-2 rounded-[var(--radius-control)] px-1 py-1 text-left hover:bg-hover"
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                    line.checked
                      ? "border-success bg-success text-white"
                      : "border-line-strong text-transparent group-hover:border-accent",
                  )}
                >
                  <Check size={10} strokeWidth={3} />
                </span>
                <span className={cn("text-[13px]", line.checked ? "text-faint" : "text-ink")}>
                  {line.text}
                  {line.isReliabilityProbe ? (
                    <span className="ml-1.5 text-[11px] text-faint">· medidor</span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {panel.notChecked.length > 0 ? (
        <div className="rounded-[var(--radius-card)] border border-line bg-sunk p-3">
          <h4 className="label-mono mb-1.5 flex items-center gap-1.5">
            <ShieldQuestion size={13} className="text-faint" />
            A revisão automática não confere isto
          </h4>
          <ul className="flex flex-col gap-1 text-[12.5px] text-faint">
            {panel.notChecked.map((rule) => (
              <li key={rule.code}>
                <span className="text-ink">{rule.code}</span> — {rule.text}
                {rule.who === "fora" ? " (não é sobre a peça)" : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}
    </section>
  );
}
