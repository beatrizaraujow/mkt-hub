"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PickerOptions, PickRow } from "./pick";
import { searchDeliveries } from "./pick-actions";

/**
 * A entrega apontada, e a caixa que troca de entrega.
 *
 * Substitui o `<select>` de quarenta opções e o botão "Diagnosticar". Escolher
 * já diagnostica: o botão existia só para submeter um formulário que não
 * precisava existir, e o passo a mais fazia a tela parecer um relatório que se
 * pede em vez de uma tela que se olha.
 *
 * O estado continua na URL (`?item=…`), então voltar, recarregar e mandar o
 * link para alguém continuam funcionando.
 */

/** O que aconteceu na última rodada, se houve alguma. */
const LAST: Record<string, { label: string; tone: string }> = {
  aprovado: { label: "sem violação", tone: "text-success" },
  ajustar: { label: "ajustar", tone: "text-warning" },
  reprovado: { label: "reprovado", tone: "text-danger" },
  incompleto: { label: "barrado", tone: "text-warning" },
  falhou: { label: "falhou", tone: "text-warning" },
  pendente: { label: "na fila", tone: "text-faint" },
  rodando: { label: "rodando", tone: "text-faint" },
};

function selo(row: PickRow) {
  if (!row.last) return null;
  return LAST[row.last.verdict ?? row.last.status] ?? null;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-[11.5px] transition-colors",
        active
          ? "border border-brand-line bg-brand-soft font-medium text-ink"
          : "border border-line text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function ItemPicker({
  current,
  options,
}: {
  /** A entrega já apontada, para o rastro. Nula na primeira visita. */
  current: { id: string; title: string; companyName: string; projectName: string | null } | null;
  options: PickerOptions;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [mine, setMine] = useState(false);
  /**
   * Guarda junto o recorte a que o resultado pertence. Assim "está buscando" e
   * "o que mostrar" saem por dedução, sem `setState` dentro do efeito — e
   * resposta atrasada de um filtro antigo nunca aparece como se fosse do atual.
   */
  const [result, setResult] = useState<{ key: string; rows: PickRow[]; total: number }>({
    key: "",
    rows: [],
    total: 0,
  });
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setTerm("");
    setCursor(0);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  /**
   * Espera a digitação parar e descarta resposta atrasada: sem isso a resposta
   * de "car" chega depois da de "carrossel" e sobrescreve a lista certa.
   */
  const recorte = JSON.stringify({ term: term.trim(), companyId, stageId, mine });

  useEffect(() => {
    if (!open) return;

    let alive = true;
    const filtros = JSON.parse(recorte) as {
      term: string;
      companyId: string | null;
      stageId: string | null;
      mine: boolean;
    };

    const timer = setTimeout(async () => {
      const found = await searchDeliveries(filtros);
      if (!alive) return;
      setResult({ key: recorte, ...found });
      setCursor(0);
    }, 180);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, recorte]);

  /**
   * A lista anterior continua na tela enquanto a nova não chega. Esvaziar a
   * cada tecla faria a caixa piscar entre "nada encontrado" e o resultado — e
   * "nada encontrado" que aparece sozinho por meio segundo é mentira na tela.
   */
  const loading = result.key !== recorte;
  const rows = result.rows;

  const escolher = useCallback(
    (row: PickRow) => {
      close();
      router.push(`/revisor?item=${row.id}`);
    },
    [close, router],
  );

  function onFieldKey(event: React.KeyboardEvent) {
    if (!rows.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => (c + 1) % rows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => (c - 1 + rows.length) % rows.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[cursor];
      if (row) escolher(row);
    }
  }

  const abrir = () => {
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <>
      {current ? (
        <div className="flex flex-wrap items-center gap-2.5 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[13px]">
            <span className="text-faint">{current.companyName}</span>
            {current.projectName && (
              <>
                <ChevronRight size={12} className="text-faint" aria-hidden />
                <span className="text-faint">{current.projectName}</span>
              </>
            )}
            <ChevronRight size={12} className="text-faint" aria-hidden />
            <span className="min-w-0 truncate text-ink">{current.title}</span>
          </span>

          <button
            type="button"
            onClick={abrir}
            className="text-[12px] text-accent transition-opacity hover:opacity-80"
          >
            trocar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={abrir}
          className="flex items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-[13px] text-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          <Search size={14} />
          Escolher a entrega
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 pt-[8vh] sm:p-6 sm:pt-[10vh]">
          <div
            aria-hidden
            onMouseDown={close}
            className="fixed inset-0 bg-black/40 backdrop-blur-[1px]"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Trocar entrega"
            className="relative z-10 w-full max-w-[560px] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-[0_24px_64px_rgba(0,0,0,0.32)]"
          >
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <Search size={16} className="shrink-0 text-faint" />
              <input
                ref={inputRef}
                autoFocus
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={onFieldKey}
                placeholder="Título da entrega ou empresa…"
                className="h-12 flex-1 border-0 bg-transparent text-[14.5px] text-ink placeholder:text-faint focus:outline-none"
              />
              <kbd className="hidden rounded border border-line px-1 text-[10px] text-faint sm:inline">
                ESC
              </kbd>
            </div>

            <div className="scroll-thin flex gap-1.5 overflow-x-auto border-b border-line px-4 py-2.5">
              <Chip active={companyId === null} onClick={() => setCompanyId(null)}>
                Todas as empresas
              </Chip>
              {options.companies.map((company) => (
                <Chip
                  key={company.id}
                  active={companyId === company.id}
                  onClick={() => setCompanyId(company.id)}
                >
                  {company.name}
                </Chip>
              ))}

              <span className="mx-1 w-px shrink-0 self-stretch bg-line" aria-hidden />

              <select
                value={stageId ?? ""}
                onChange={(e) => setStageId(e.target.value || null)}
                aria-label="Filtrar por etapa"
                className={cn(
                  "shrink-0 cursor-pointer rounded-full border px-2.5 py-1 text-[11.5px] focus:outline-none",
                  stageId
                    ? "border-brand-line bg-brand-soft text-ink"
                    : "border-line bg-surface text-muted",
                )}
              >
                <option value="">Qualquer etapa</option>
                {options.stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>

              <Chip active={mine} onClick={() => setMine((v) => !v)}>
                só minhas
              </Chip>
            </div>

            <div className="scroll-thin max-h-[46vh] overflow-y-auto py-1.5">
              {rows.length === 0 && !loading && (
                <p className="px-4 py-8 text-center text-[13px] text-faint">
                  Nenhuma entrega com esses filtros.
                </p>
              )}

              {rows.map((row, index) => {
                const marca = selo(row);
                return (
                  <button
                    key={row.id}
                    type="button"
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => escolher(row)}
                    className={cn(
                      "flex w-full flex-col gap-1 border-l-2 px-4 py-2.5 text-left transition-colors",
                      index === cursor
                        ? "border-l-brand-line bg-brand-soft/60"
                        : "border-l-transparent hover:bg-hover",
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[13.5px] text-ink">{row.title}</span>
                      {marca && (
                        <span className={cn("shrink-0 font-mono text-[10.5px]", marca.tone)}>
                          {marca.label}
                        </span>
                      )}
                    </span>
                    <span className="truncate text-[11.5px] text-faint">
                      {[row.companyName, row.projectName, row.stageName].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t border-line px-4 py-1.5 text-[11px] text-faint">
              <span className="tnum">
                {loading
                  ? "buscando…"
                  : `${rows.length} de ${result.total} entrega${result.total === 1 ? "" : "s"}`}
              </span>
              <span className="hidden sm:inline">↑↓ navega · Enter diagnostica</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
