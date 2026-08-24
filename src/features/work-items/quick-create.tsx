"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createWorkItem, type ActionState } from "./actions";

export type QuickCreateOptions = {
  companies: Array<{ id: string; name: string; color: string; parentId: string | null }>;
  projects: Array<{ id: string; name: string; companyId: string }>;
  people: Array<{ id: string; name: string }>;
};

const selectClass =
  "h-8 rounded-[var(--radius-control)] border border-line bg-surface px-2 text-[13px] text-ink " +
  "transition-colors duration-150 focus:border-accent focus:outline-none";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Criando…" : "Criar"}
    </Button>
  );
}

export function QuickCreate({ options }: { options: QuickCreateOptions }) {
  const [open, setOpen] = useState(false);
  // Comeca numa empresa-mae, nao na primeira do alfabeto.
  const [companyId, setCompanyId] = useState(
    (options.companies.find((c) => !c.parentId) ?? options.companies[0])?.id ?? "",
  );
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const [state, action] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await createWorkItem(prev, formData);
    if (result.ok) {
      formRef.current?.reset();
      // Fica aberto: quem cria uma tarefa quase sempre cria a proxima.
      titleRef.current?.focus();
    }
    return result;
  }, {});

  const close = useCallback(() => setOpen(false), []);

  // Atalho C de qualquer lugar, desde que o foco nao esteja num campo.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (event.key === "Escape" && open) {
        close();
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      // Nao abre por cima de outro modal, como o detalhe da tarefa.
      if (!open && document.querySelector('[aria-modal="true"]')) return;
      if (event.key === "c" || event.key === "C") {
        event.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (open) titleRef.current?.focus();
  }, [open]);

  const visibleProjects = options.projects.filter((p) => p.companyId === companyId);
  const noCompanies = options.companies.length === 0;

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={noCompanies}>
        <Plus size={15} strokeWidth={2} />
        Nova tarefa
        <kbd className="ml-1 hidden rounded border border-current/25 px-1 text-[10px] opacity-70 sm:inline">
          C
        </kbd>
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[12vh]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Nova tarefa"
            className="w-full max-w-[560px] rounded-[var(--radius-card)] border border-line bg-surface shadow-[0_16px_48px_rgba(0,0,0,0.18)]"
          >
            <form ref={formRef} action={action} className="p-4">
              <div className="mb-3 flex items-start gap-2">
                <Input
                  ref={titleRef}
                  name="title"
                  required
                  autoComplete="off"
                  placeholder="O que precisa ser feito?"
                  className="h-10 border-0 bg-transparent px-0 text-[16px] focus:border-0"
                />
                <button
                  type="button"
                  onClick={close}
                  aria-label="Fechar"
                  className="mt-2 shrink-0 text-faint transition-colors hover:text-ink"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  name="companyId"
                  required
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className={selectClass}
                  aria-label="Empresa"
                >
                  {options.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.parentId ? `— ${c.name}` : c.name}
                    </option>
                  ))}
                </select>

                {visibleProjects.length > 0 && (
                  <select name="projectId" className={selectClass} aria-label="Projeto">
                    <option value="">Sem projeto</option>
                    {visibleProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}

                <select name="assigneeId" className={selectClass} aria-label="Responsável">
                  <option value="">Para mim</option>
                  {options.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                <input
                  type="date"
                  name="dueDate"
                  aria-label="Prazo"
                  className={cn(selectClass, "w-[142px]")}
                />

                <select
                  name="priority"
                  defaultValue="media"
                  className={selectClass}
                  aria-label="Prioridade"
                >
                  <option value="urgente">Urgente</option>
                  <option value="alta">Alta</option>
                  <option value="media">Média</option>
                  <option value="baixa">Baixa</option>
                </select>

                <div className="ml-auto">
                  <Submit />
                </div>
              </div>

              {state.error ? (
                <p role="alert" className="mt-3 text-[13px] text-danger">
                  {state.error}
                </p>
              ) : null}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
