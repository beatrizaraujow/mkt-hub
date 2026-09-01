"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, RefreshCw } from "lucide-react";
import { BRT_TZ } from "@/lib/date";
import { cn } from "@/lib/utils";
import { answerChecklist, requestReview } from "./actions";
import type { ReviewPanel, ReviewRound } from "./panel-data";

/**
 * O parecer, na tela de quem vai corrigir.
 *
 * A ordem é a de quem lê com pressa: o veredito, o que reprovou, por qual regra,
 * com o trecho citado. Depois a cobertura — o que foi conferido de um lado, o
 * que a revisão automática não alcança do outro. E, no fim, as rodadas.
 *
 * **Não existe nota.** O veredito é nomeável e binário, e um número de 0 a 10 ao
 * lado dele viraria a única coisa que alguém lê.
 *
 * **Falha técnica nunca vira veredito.** Ela tem bloco próprio, em âmbar de
 * aviso, e nunca no vermelho de reprovação: ler "falhou" em vermelho ensina o
 * time a achar que o robô reprovou a peça.
 */

const VERDICT: Record<
  string,
  { label: string; consequencia: string; texto: string; borda: string; fundo: string }
> = {
  aprovado: {
    label: "Sem violação de regra",
    consequencia: "Nenhuma regra conferível foi violada",
    texto: "text-success",
    borda: "border-success/35",
    fundo: "bg-success-soft",
  },
  ajustar: {
    label: "Ajustar",
    consequencia: "achados que não reprovam sozinhos",
    texto: "text-warning",
    borda: "border-warning/35",
    fundo: "bg-warning-soft",
  },
  reprovado: {
    label: "Reprovado",
    consequencia: "regra inegociável violada",
    texto: "text-danger",
    borda: "border-danger/35",
    fundo: "bg-danger-soft",
  },
};

const STATUS_TEXT: Record<string, string> = {
  pendente: "Na fila.",
  rodando: "Revisando agora.",
  incompleto: "Não deu para revisar:",
};

const ROUND_VERDICT: Record<string, string> = {
  aprovado: "SEM VIOLAÇÃO",
  ajustar: "AJUSTAR",
  reprovado: "REPROVADO",
};

const quando = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BRT_TZ,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function Bloco({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[var(--radius-card)] border border-line bg-surface p-3.5", className)}>
      <h4 className="label-mono">{title}</h4>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Rodada({ round, atual }: { round: ReviewRound; atual: boolean }) {
  const veredito = round.verdict ? ROUND_VERDICT[round.verdict] : null;

  return (
    <div
      className={cn(
        "rounded-[var(--radius-control)] border p-3",
        atual ? "border-line-strong bg-hover" : "border-line",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint">
          Rodada {round.round}
          {atual ? " · atual" : ""}
        </span>
        <span
          className={cn(
            "font-mono text-[9.5px] uppercase tracking-[0.06em]",
            round.verdict ? VERDICT[round.verdict]?.texto : "text-faint",
          )}
        >
          {veredito ?? (round.status === "falhou" ? "FALHOU" : "—")}
        </span>
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-muted">
        {round.codes.length > 0 ? round.codes.join(" · ") : "sem achado"}
      </p>

      <p className="mt-1.5 font-mono text-[10px] text-faint">{quando.format(round.createdAt)}</p>
    </div>
  );
}

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

  /** Os códigos violados nesta rodada, para marcar a lista de conferidos. */
  const violados = new Set(panel.findings.map((finding) => finding.ruleCode));

  function retry() {
    setError(null);
    start(async () => {
      const result = await requestReview(workItemId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <section className="@container flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h3 className="label-mono">Revisão IA</h3>
        {cycle ? <span className="tnum text-[12px] text-faint">rodada {cycle.round}</span> : null}
        {cycle?.isSilent ? (
          <span
            className="rounded-[5px] border border-warning/40 bg-warning-soft px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-warning"
            title="Em calibragem: o parecer não move nada sozinho."
          >
            Modo silencioso
          </span>
        ) : null}
        {cycle?.reused ? (
          <span
            className="text-[11px] text-faint"
            title="Mesma copy e mesmas regras da rodada anterior."
          >
            parecer repetido
          </span>
        ) : null}

        {cycle ? (
          <span className="ml-auto font-mono text-[10.5px] text-faint">
            {quando.format(cycle.createdAt)}
            {cycle.model ? ` · ${cycle.model}` : ""}
          </span>
        ) : null}
      </div>

      {!panel.enabled ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-line px-3 py-2.5 text-[12.5px] text-faint">
          A revisão automática está desligada para esta empresa.
        </p>
      ) : null}

      {/* Em andamento ou barrado no porteiro: estado, não veredito. */}
      {cycle && cycle.status !== "emitido" && cycle.status !== "falhou" ? (
        <div className="rounded-[var(--radius-card)] border border-line bg-sunk px-3 py-2.5 text-[13px] text-ink">
          <p>{STATUS_TEXT[cycle.status] ?? cycle.status}</p>
          {cycle.gateMissing.length > 0 ? (
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-[12.5px] text-faint">
              {cycle.gateMissing.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {cycle.status === "incompleto" ? (
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

      {/*
        A falha vem em ambar e diz, com todas as letras, que nada foi julgado e
        nada mudou. É o bloco mais fácil de confundir com reprovação, e o mais
        caro de confundir.
      */}
      {cycle?.status === "falhou" ? (
        <div className="rounded-[var(--radius-card)] border border-warning/40 bg-warning-soft p-3.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="rounded-[5px] border border-warning/45 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-warning">
              Falhou
            </span>
            <span className="text-[12.5px] text-ink">
              A rodada não produziu parecer. Nada foi julgado, nada mudou na tarefa.
            </span>
          </div>

          {cycle.lastError ? (
            <p className="mt-2.5 break-words rounded-[var(--radius-control)] border border-line bg-sunk px-3 py-2 font-mono text-[11px] leading-relaxed text-muted">
              {cycle.lastError}
            </p>
          ) : null}

          <button
            type="button"
            onClick={retry}
            disabled={busy}
            className="mt-2.5 flex items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-surface px-2 py-1 text-[12.5px] text-ink transition-colors hover:bg-hover disabled:opacity-50"
          >
            <RefreshCw size={12} className={cn(busy && "animate-spin")} />
            Tentar de novo
          </button>
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
        <div className={cn("rounded-[var(--radius-card)] border p-3.5", verdict.borda, verdict.fundo)}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              className={cn(
                "font-mono text-[13px] font-semibold uppercase tracking-[0.08em]",
                verdict.texto,
              )}
            >
              {verdict.label}
            </span>
            <span className="text-[12px] text-muted">
              {cycle?.verdict === "aprovado" ? (
                verdict.consequencia
              ) : (
                <>
                  <span className="tnum">{panel.findings.length}</span> {verdict.consequencia}
                </>
              )}
              {cycle?.isSilent ? " · o parecer não move a tarefa" : ""}
            </span>
          </div>

          {panel.findings.map((finding) => (
            <article
              key={finding.id}
              className="mt-3 rounded-[var(--radius-control)] border border-line bg-surface p-3"
            >
              <header className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-[11.5px] font-medium text-ink">
                  {finding.ruleCode}
                </code>
                {finding.isBlocking ? (
                  <span className="rounded-[4px] border border-danger/35 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-danger">
                    inegociável
                  </span>
                ) : null}
              </header>

              <p className="mt-2 text-[13.5px] leading-relaxed text-ink">{finding.detail}</p>

              {/*
                O trecho citado é o que separa parecer de opinião: sem ele não há
                o que contestar, e um parecer que não se contesta não se corrige.
              */}
              {finding.excerpt ? (
                <p
                  className={cn(
                    "mt-2.5 border-l-2 px-3 py-2 text-[12.5px] leading-relaxed text-ink",
                    finding.isBlocking
                      ? "border-danger/60 bg-danger-soft"
                      : "border-warning/60 bg-warning-soft",
                  )}
                >
                  “{finding.excerpt}”
                </p>
              ) : null}

              {finding.suggestion ? (
                <p className="mt-2 rounded-[var(--radius-control)] bg-sunk px-2.5 py-2 text-[12.5px] text-ink">
                  {finding.suggestion}
                </p>
              ) : null}

              <p className="mt-2 text-[11.5px] text-faint">{finding.ruleText}</p>
            </article>
          ))}
        </div>
      ) : null}

      {panel.language.length > 0 ? (
        <Bloco title="Português">
          <p className="-mt-1.5 mb-2.5 text-[11.5px] text-faint">
            Não reprova nada. Conserto de segundos.
          </p>
          <ul className="flex flex-col gap-1.5 text-[12.5px]">
            {panel.language.map((note, index) => (
              <li key={`${note.trecho}-${index}`} className="text-ink">
                <span className="text-faint line-through">{note.trecho}</span>{" "}
                <span aria-hidden>→</span> {note.correcao}
              </li>
            ))}
          </ul>
        </Bloco>
      ) : null}

      {/*
        Cobertura é bloco fixo, e é fixo de propósito: quando um sistema desses
        entra no ar todo mundo assume que ele cuida de tudo, e as regras que
        continuaram humanas param de ser conferidas por qualquer um — cada lado
        achando que o outro está olhando.
      */}
      {cycle?.status === "emitido" ? (
        <div className="grid gap-3 @md:grid-cols-2">
          <Bloco title="Foi conferido">
            {panel.applied.length === 0 ? (
              <p className="text-[12.5px] text-faint">Nenhuma regra de máquina neste recorte.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-[13px]">
                {panel.applied.map((code) => (
                  <li key={code} className="flex items-baseline gap-2.5">
                    <Check size={12} className="shrink-0 translate-y-[2px] text-accent" />
                    <code className="min-w-0 flex-1 font-mono text-[12px] text-ink">{code}</code>
                    <span
                      className={cn(
                        "font-mono text-[10.5px]",
                        violados.has(code) ? "text-danger" : "text-faint",
                      )}
                    >
                      {violados.has(code) ? "violada" : "ok"}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {panel.notVerified.length > 0 ? (
              <div className="mt-3 border-t border-line pt-2.5">
                <p className="text-[11.5px] text-warning">Não deu para conferir:</p>
                <ul className="mt-1 flex flex-col gap-1 text-[11.5px] text-faint">
                  {panel.notVerified.map((row) => (
                    <li key={row.code}>
                      <span className="text-ink">{row.code}</span> — {row.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Bloco>

          <Bloco title="A revisão automática não confere isto">
            {panel.notChecked.length === 0 ? (
              <p className="text-[12.5px] text-faint">
                Nada — todas as regras deste recorte são de máquina.
              </p>
            ) : (
              <ul className="flex flex-col gap-2 text-[12.5px] text-muted">
                {panel.notChecked.map((rule) => (
                  <li key={rule.code} className="flex gap-2.5">
                    <span aria-hidden className="text-faint">
                      —
                    </span>
                    <span>
                      <span className="text-ink">{rule.code}</span> {rule.text}
                      {rule.who === "fora" ? " (não é sobre a peça)" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-3 border-t border-line pt-2.5 text-[11px] leading-relaxed text-faint">
              Cobertura é bloco fixo: o parecer sempre diz onde ele não alcança.
            </p>
          </Bloco>
        </div>
      ) : null}

      {panel.rounds.length > 1 ? (
        <Bloco title="Rodadas desta entrega">
          <div className="grid gap-2.5 @md:grid-cols-2 @lg:grid-cols-3">
            {panel.rounds.map((round) => (
              <Rodada key={round.id} round={round} atual={round.id === cycle?.id} />
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-faint">
            Cada rodada é uma linha nova. Na terceira reprovação o sistema para de decidir e a
            entrega vai para uma pessoa.
          </p>
        </Bloco>
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
        <Bloco title="Checklist da aprovação">
          <p className="-mt-1.5 mb-2 text-[11.5px] text-faint">
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
                  {/*
                    A co-assinatura da exceção. Marcada, não é "mais um item":
                    é quem aprova assinando junto a decisão de pular a revisão,
                    no lugar do item do laudo — que aqui não existe.
                  */}
                  {line.isCosign ? (
                    <span className="ml-1.5 text-[11px] text-faint">· exceção declarada</span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        </Bloco>
      ) : null}

      {error ? <p className="text-[12.5px] text-danger">{error}</p> : null}
    </section>
  );
}
