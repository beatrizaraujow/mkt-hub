"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatarDuracao, parseDuration } from "@/lib/duration";
import { Button } from "@/components/ui/button";
import { adjustEntry, discardEntry, logManualTime, type TimeState } from "./actions";
import type { TimeEntryRow, TimeSummary } from "./queries";

/**
 * A aba Tempo.
 *
 * Saiu do `detail-panel` porque virou tela com estado proprio — edicao em
 * linha, lancamento manual, leitura de duracao —, e cada uma dessas coisas
 * dentro de um arquivo de novecentas linhas some.
 *
 * **O que o ClickUp faz e a gente nao copia**, de proposito:
 *
 *   · O interruptor de faturavel. A casa nao cobra por hora.
 *   · Tag por lancamento. O registro ja sabe a tarefa, a empresa e a pessoa;
 *     tag seria uma segunda taxonomia paralela que ninguem mantem.
 *   · A linha "Sem subtarefas" mesmo quando nao ha subtarefa. No print que
 *     originou este trabalho, as duas linhas diziam 4h 30m — o mesmo numero
 *     escrito duas vezes.
 *   · O intervalo `10:55 am - 10:55 am` que aparece antes de a pessoa digitar
 *     qualquer coisa. Um dado que nao e dado.
 *
 * A regra que sai disso: **divisao so quando ha o que dividir**. Vale para o
 * total com subtarefa e para o agrupamento por pessoa.
 */

const campo =
  "h-7 rounded-[var(--radius-control)] border border-line bg-surface px-2 text-[13px] text-ink " +
  "transition-colors duration-150 focus:border-accent focus:outline-none";

const DIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
});

const HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes.at(-1)?.[0] ?? "")).toUpperCase();
}

/* --------------------------------------------------------------- uma linha */

function Linha({
  entrada,
  minha,
  pendente,
  roda,
}: {
  entrada: TimeEntryRow;
  minha: boolean;
  pendente: boolean;
  roda: (fn: () => Promise<TimeState>) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [duracao, setDuracao] = useState("");
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  function abrir() {
    setDuracao(formatarDuracao(entrada.durationSeconds ?? 0));
    setNota(entrada.note ?? "");
    setErro(null);
    setEditando(true);
  }

  function salvar() {
    // Le no navegador antes de ir ao servidor: erro de digitacao nao merece
    // uma ida e volta. O servidor le de novo, porque so ele decide de verdade.
    const lida = parseDuration(duracao);
    if ("erro" in lida) return setErro(lida.erro);

    roda(async () => {
      const r = await adjustEntry(entrada.id, duracao, nota);
      if (r.ok) setEditando(false);
      else setErro(r.error ?? null);
      return r;
    });
  }

  if (editando) {
    return (
      <div className="flex flex-col gap-1.5 border-b border-line py-2 last:border-b-0">
        <div className="flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={duracao}
            onChange={(e) => {
              setDuracao(e.target.value);
              setErro(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") salvar();
              if (e.key === "Escape") setEditando(false);
            }}
            placeholder="1h30"
            className={cn(campo, "w-[86px] tnum")}
          />
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") salvar();
              if (e.key === "Escape") setEditando(false);
            }}
            placeholder="Nota (opcional)"
            className={cn(campo, "min-w-0 flex-1")}
          />
          <button
            type="button"
            onClick={salvar}
            disabled={pendente}
            aria-label="Salvar"
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-accent transition-colors hover:bg-hover"
          >
            <Check size={14} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={() => setEditando(false)}
            aria-label="Cancelar"
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-faint transition-colors hover:bg-hover hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>
        {erro && <p className="text-[12px] text-danger">{erro}</p>}
      </div>
    );
  }

  return (
    <div className="group flex items-baseline gap-2.5 border-b border-line py-1.5 last:border-b-0">
      <span className="tnum w-[62px] shrink-0 text-[13px] font-medium text-ink">
        {formatarDuracao(entrada.durationSeconds ?? 0)}
      </span>

      <span
        className="tnum w-[42px] shrink-0 text-[12px] text-faint"
        title={
          entrada.endedAt
            ? `${HORA.format(entrada.startedAt)} às ${HORA.format(entrada.endedAt)}`
            : undefined
        }
      >
        {DIA.format(entrada.startedAt)}
      </span>

      <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">
        {entrada.isSubtask ? `↳ ${entrada.fromTitle}` : entrada.fromTitle}
        {entrada.note && <span className="text-faint"> · {entrada.note}</span>}
      </span>

      {entrada.autoClosed && !entrada.confirmedAt && (
        <span className="shrink-0 rounded border border-warning/40 bg-warning-soft px-1.5 py-0.5 text-[10.5px] text-warning">
          a confirmar
        </span>
      )}

      {minha ? (
        /*
         * So aparece no hover: com sete pessoas lancando na mesma tarefa, dois
         * icones por linha viram vinte icones competindo com o numero, que e a
         * unica coisa que alguem veio ler aqui.
         */
        <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={abrir}
            aria-label="Corrigir lançamento"
            className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-control)] text-faint transition-colors hover:bg-hover hover:text-ink"
          >
            <Pencil size={12.5} />
          </button>
          <button
            type="button"
            disabled={pendente}
            onClick={() => roda(() => discardEntry(entrada.id))}
            aria-label="Apagar lançamento"
            className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-control)] text-faint transition-colors hover:bg-hover hover:text-danger"
          >
            <Trash2 size={12.5} />
          </button>
        </span>
      ) : null}

      <span className="w-6 shrink-0 text-right text-[11.5px] text-faint">
        {entrada.userName ? iniciais(entrada.userName) : "—"}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------- a aba */

export function TimeTab({
  itemId,
  meId,
  hoje,
  resumo,
  entradas,
}: {
  itemId: string;
  meId: string;
  hoje: string;
  resumo: TimeSummary;
  entradas: TimeEntryRow[];
}) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [lancando, setLancando] = useState(false);
  const [duracao, setDuracao] = useState("");
  const [dia, setDia] = useState(hoje);
  const [nota, setNota] = useState("");

  function roda(fn: () => Promise<TimeState>) {
    setErro(null);
    iniciar(async () => {
      const r = await fn();
      if (r.error) setErro(r.error);
    });
  }

  function lancar() {
    const lida = parseDuration(duracao);
    if ("erro" in lida) return setErro(lida.erro);

    roda(async () => {
      const r = await logManualTime(itemId, duracao, dia, nota);
      if (r.ok) {
        setDuracao("");
        setNota("");
        setLancando(false);
      }
      return r;
    });
  }

  const total = resumo.own + resumo.subtasks;
  /** A divisão só existe quando há subtarefa com tempo. Senão é o mesmo número duas vezes. */
  const dividir = resumo.subtasks > 0;

  const pessoas = new Set(entradas.map((e) => e.userName).filter(Boolean));
  const mostrarQuem = pessoas.size > 1;

  return (
    <div className="flex flex-col gap-3">
      {/* ------------------------------------------------------------ total */}
      <div className="flex items-baseline justify-between border-b border-line pb-2">
        <span className="label-mono">Tempo registrado</span>
        <span className="tnum text-[15px] font-medium text-ink">{formatarDuracao(total)}</span>
      </div>

      {dividir && (
        <div className="-mt-2 flex flex-col gap-1 text-[12.5px]">
          <div className="flex items-baseline justify-between text-muted">
            <span>Nesta tarefa</span>
            <span className="tnum">{formatarDuracao(resumo.own)}</span>
          </div>
          <div className="flex items-baseline justify-between text-muted">
            <span>Nas subtarefas</span>
            <span className="tnum">{formatarDuracao(resumo.subtasks)}</span>
          </div>
        </div>
      )}

      {erro && (
        <p role="alert" className="text-[12.5px] text-danger">
          {erro}
        </p>
      )}

      {/* ---------------------------------------------------------- lançar */}
      {lancando ? (
        <div className="flex flex-col gap-1.5 rounded-[var(--radius-control)] border border-line bg-sunk p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <input
              autoFocus
              value={duracao}
              onChange={(e) => {
                setDuracao(e.target.value);
                setErro(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") lancar();
                if (e.key === "Escape") setLancando(false);
              }}
              placeholder="1h30"
              className={cn(campo, "tnum w-[86px]")}
            />
            <input
              type="date"
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              className={cn(campo, "w-[140px]")}
            />
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") lancar();
                if (e.key === "Escape") setLancando(false);
              }}
              placeholder="Nota (opcional)"
              className={cn(campo, "min-w-[120px] flex-1")}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" disabled={pendente} onClick={lancar}>
              Lançar
            </Button>
            <button
              type="button"
              onClick={() => setLancando(false)}
              className="text-[12.5px] text-faint transition-colors hover:text-ink"
            >
              Cancelar
            </button>
            <span className="ml-auto text-[11.5px] text-faint">
              aceita 1h30 · 45m · 2h · 1:30
            </span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setLancando(true)}
          className="self-start text-[12.5px] text-faint transition-colors hover:text-ink"
        >
          + Lançar manual
        </button>
      )}

      {/* --------------------------------------------------------- entradas */}
      {entradas.length === 0 ? (
        <p className="text-[13px] text-faint">Nenhum tempo registrado ainda.</p>
      ) : (
        <div className="flex flex-col">
          {mostrarQuem && (
            <p className="label-mono pb-1">
              {pessoas.size} pessoas lançaram
            </p>
          )}
          {entradas.map((entrada) => (
            <Linha
              key={entrada.id}
              entrada={entrada}
              minha={entrada.userId === meId}
              pendente={pendente}
              roda={roda}
            />
          ))}
        </div>
      )}
    </div>
  );
}
