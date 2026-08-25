"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, FolderOpen, Search, SquareCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { search } from "./actions";
import { EMPTY_RESULTS, MIN_TERM, type SearchResults } from "./types";

type Row =
  | { kind: "item"; id: string; href: string; label: string; hint: string; done: boolean }
  | { kind: "project"; id: string; href: string; label: string; hint: string; done: false }
  | { kind: "company"; id: string; href: string; label: string; hint: string; done: false };

const ICON = { item: SquareCheck, project: FolderOpen, company: Building2 };
const GROUP = { item: "Tarefas", project: "Projetos", company: "Empresas" };

/**
 * Busca global, aberta por `/` ou Ctrl+K de qualquer tela.
 *
 * Resultado de tarefa navega para `/trabalho?item=…` em vez de só trocar o
 * parâmetro: o painel de detalhe só está montado em Hoje e Trabalho, e mudar
 * a URL numa tela que não o monta não abriria nada.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  /**
   * Guarda junto o termo a que o resultado pertence. Assim "está buscando" e
   * "o que mostrar" saem por dedução, sem `setState` dentro do efeito — e
   * resposta atrasada de um termo antigo nunca aparece como se fosse do atual.
   */
  const [results, setResults] = useState<{ term: string; data: SearchResults }>({
    term: "",
    data: EMPTY_RESULTS,
  });
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setTerm("");
    setResults({ term: "", data: EMPTY_RESULTS });
    setCursor(0);
  }, []);

  // Abre por `/` ou Ctrl+K, desde que o foco não esteja num campo de texto.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // Esc no nivel da janela: fechar nao pode depender de o foco ainda
      // estar no campo, que e o que acontece depois de passar o mouse na lista.
      if (event.key === "Escape" && open) {
        close();
        return;
      }

      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      const combo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!combo && (typing || event.key !== "/")) return;
      if (!combo && (event.metaKey || event.ctrlKey || event.altKey)) return;
      // Não abre por cima de outro modal, como o detalhe da tarefa.
      if (!open && document.querySelector('[aria-modal="true"]')) return;

      event.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  /**
   * Espera a digitação parar antes de consultar, e descarta resposta atrasada:
   * sem isso, digitar rápido faz a resposta de "car" chegar depois da de
   * "carrossel" e sobrescrever a lista certa pela errada.
   */
  useEffect(() => {
    if (!open) return;

    const clean = term.trim();
    if (clean.length < MIN_TERM) return;

    let alive = true;
    const timer = setTimeout(async () => {
      const found = await search(clean);
      if (!alive) return;
      setResults({ term: clean, data: found });
      setCursor(0);
    }, 180);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [term, open]);

  const clean = term.trim();
  const ready = clean.length >= MIN_TERM;
  const fresh = ready && results.term === clean;
  const loading = ready && !fresh;
  const shown = fresh ? results.data : EMPTY_RESULTS;

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];

    for (const hit of shown.items) {
      out.push({
        kind: "item",
        id: hit.id,
        href: `/trabalho?item=${hit.id}`,
        label: hit.parentTitle ? `${hit.parentTitle} ↳ ${hit.title}` : hit.title,
        hint: [hit.companyName, hit.projectName, hit.stageName, hit.assigneeName]
          .filter(Boolean)
          .join(" · "),
        done: hit.done,
      });
    }
    for (const project of shown.projects) {
      out.push({
        kind: "project",
        id: project.id,
        href: `/empresas/${project.companySlug}`,
        label: project.name,
        hint: project.companyName,
        done: false,
      });
    }
    for (const company of shown.companies) {
      out.push({
        kind: "company",
        id: company.id,
        href: `/empresas/${company.slug}`,
        label: company.name,
        hint: "Empresa",
        done: false,
      });
    }
    return out;
  }, [shown]);

  const go = useCallback(
    (row: Row) => {
      close();
      router.push(row.href);
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
      if (row) go(row);
    }
  }

  const short = clean.length > 0 && !ready;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className="flex h-8 w-full items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[13px] text-faint transition-colors hover:border-line-strong hover:text-muted"
      >
        <Search size={14} />
        <span className="flex-1 text-left">Buscar</span>
        <kbd className="hidden rounded border border-current/25 px-1 text-[10px] opacity-70 sm:inline">
          /
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 pt-[10vh] sm:p-6 sm:pt-[12vh]">
          <div
            aria-hidden
            onMouseDown={close}
            className="fixed inset-0 bg-black/40 backdrop-blur-[1px]"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Buscar"
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
                placeholder="Tarefa, projeto, empresa, quem pediu…"
                className="h-12 flex-1 border-0 bg-transparent text-[14.5px] text-ink placeholder:text-faint focus:outline-none"
              />
              {loading && <span className="text-[11.5px] text-faint">buscando…</span>}
            </div>

            <div className="scroll-thin max-h-[52vh] overflow-y-auto p-1.5">
              {short && (
                <p className="px-2.5 py-6 text-center text-[13px] text-faint">
                  Digite ao menos {MIN_TERM} letras.
                </p>
              )}

              {!short && !loading && ready && rows.length === 0 && (
                <p className="px-2.5 py-6 text-center text-[13px] text-faint">
                  Nada encontrado para “{clean}”.
                </p>
              )}

              {!clean && (
                <p className="px-2.5 py-6 text-center text-[13px] text-faint">
                  Busca por título, briefing e nome de quem pediu. Acento não faz diferença.
                </p>
              )}

              {rows.map((row, index) => {
                const Icon = ICON[row.kind];
                const first = index === 0 || rows[index - 1].kind !== row.kind;

                return (
                  <div key={`${row.kind}-${row.id}`}>
                    {first && (
                      <p className="label-mono px-2.5 pb-1 pt-2.5 first:pt-1">{GROUP[row.kind]}</p>
                    )}
                    <button
                      type="button"
                      onMouseEnter={() => setCursor(index)}
                      onClick={() => go(row)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left transition-colors",
                        index === cursor ? "bg-hover" : "hover:bg-hover",
                      )}
                    >
                      <Icon size={14} strokeWidth={1.75} className="shrink-0 text-faint" />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-[13.5px]",
                            row.done ? "text-faint line-through" : "text-ink",
                          )}
                        >
                          {row.label}
                        </span>
                        {row.hint && (
                          <span className="block truncate text-[11.5px] text-faint">
                            {row.hint}
                          </span>
                        )}
                      </span>
                      {row.done && <Check size={13} className="shrink-0 text-success" />}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="hidden items-center justify-between border-t border-line px-3 py-1.5 text-[11px] text-faint sm:flex">
              <span>↑↓ navega · Enter abre</span>
              <span>Esc fecha</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
