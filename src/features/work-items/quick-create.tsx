"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { FORMAT_GROUPS, SKILL_GROUPS } from "@/lib/catalog";
import { createWorkItem, type ActionState } from "./actions";
import {
  AssigneeField,
  DueDateField,
  Field,
  OptionField,
  PointsField,
  PriorityField,
  type PersonOption,
} from "./field-controls";

export type QuickCreateOptions = {
  companies: Array<{ id: string; name: string; color: string; parentId: string | null }>;
  projects: Array<{ id: string; name: string; companyId: string }>;
  people: PersonOption[];
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" disabled={pending}>
      {pending ? "Criando…" : "Criar tarefa"}
    </Button>
  );
}

export function QuickCreate({
  options,
  meId,
  today,
}: {
  options: QuickCreateOptions;
  meId: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const firstParent = useMemo(
    () => (options.companies.find((c) => !c.parentId) ?? options.companies[0])?.id ?? "",
    [options.companies],
  );

  const [companyId, setCompanyId] = useState(firstParent);
  const [projectId, setProjectId] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | null>(meId);
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("media");
  const [points, setPoints] = useState("");
  const [skill, setSkill] = useState("");
  const [format, setFormat] = useState("");

  const close = useCallback(() => setOpen(false), []);

  const [state, action] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await createWorkItem(prev, formData);
    if (result.ok) close();
    return result;
  }, {});

  const reset = useCallback(() => {
    formRef.current?.reset();
    setCompanyId(firstParent);
    setProjectId("");
    setAssigneeId(meId);
    setDueDate("");
    setPriority("media");
    setPoints("");
    setSkill("");
    setFormat("");
    setDetails(false);
  }, [firstParent, meId]);

  // Atalho C de qualquer lugar, desde que o foco nao esteja num campo.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      // Nao abre por cima de outro modal, como o detalhe da tarefa.
      if (!open && document.querySelector('[aria-modal="true"]')) return;
      if (event.key === "c" || event.key === "C") {
        event.preventDefault();
        reset();
        setOpen(true);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, reset]);

  const projectsOfCompany = options.projects
    .filter((p) => p.companyId === companyId)
    .map((p) => ({ value: p.id, label: p.name, group: null }));

  const companyOptions = options.companies.map((c) => ({
    value: c.id,
    label: c.parentId ? `— ${c.name}` : c.name,
    group: null,
  }));

  const noCompanies = options.companies.length === 0;

  return (
    <>
      <Button
        size="sm"
        disabled={noCompanies}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Plus size={15} strokeWidth={2} />
        Nova tarefa
        <kbd className="ml-1 hidden rounded border border-current/25 px-1 text-[10px] opacity-70 sm:inline">
          C
        </kbd>
      </Button>

      {open && (
        <Modal
          label="Nova tarefa"
          title="Nova tarefa"
          subtitle="Entra em Pendente e na fila de quem for responsável."
          onClose={close}
        >
          <form ref={formRef} action={action} className="flex flex-col gap-4 px-5 py-4">
            <input type="hidden" name="companyId" value={companyId} />
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="assigneeId" value={assigneeId ?? ""} />
            <input type="hidden" name="dueDate" value={dueDate} />
            <input type="hidden" name="priority" value={priority} />
            <input type="hidden" name="points" value={points} />
            <input type="hidden" name="skill" value={skill} />
            <input type="hidden" name="format" value={format} />

            <Field label="Tarefa">
              <input
                ref={titleRef}
                name="title"
                required
                autoFocus
                autoComplete="off"
                placeholder="O que precisa ser feito?"
                className="h-[42px] w-full rounded-[var(--radius-control)] border border-accent bg-surface px-3 text-[14px] text-ink placeholder:text-faint focus:outline-none"
              />
            </Field>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <Field label="Empresa">
                <OptionField
                  value={companyId}
                  options={companyOptions}
                  allowEmpty={false}
                  onChange={(next) => {
                    setCompanyId(next);
                    setProjectId("");
                  }}
                />
              </Field>

              <Field label="Projeto">
                <OptionField
                  value={projectId}
                  options={projectsOfCompany}
                  emptyLabel="Sem projeto"
                  onChange={setProjectId}
                />
              </Field>

              <Field label="Responsável">
                <AssigneeField
                  value={assigneeId}
                  people={options.people}
                  meId={meId}
                  onChange={setAssigneeId}
                />
              </Field>

              <Field label="Prazo">
                <DueDateField
                  value={dueDate}
                  today={today}
                  onChange={(next) => setDueDate(next ?? "")}
                />
              </Field>
            </div>

            <button
              type="button"
              onClick={() => setDetails((v) => !v)}
              className="flex items-center gap-1 self-start text-[12.5px] text-faint transition-colors hover:text-ink"
            >
              <ChevronDown
                size={13}
                className={cn("transition-transform", details && "rotate-180")}
              />
              {details ? "menos detalhes" : "mais detalhes"}
            </button>

            {/* Ponto, tipo e formato existem, mas não travam a criação rápida. */}
            {details && (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[104px_1fr_1fr]">
                <Field label="Ponto MKT">
                  <PointsField
                    value={points}
                    onChange={setPoints}
                    onStep={(delta) =>
                      setPoints((prev) => {
                        const base = prev === "" ? 0 : Number(prev);
                        return String(Math.min(100, Math.max(0, base + delta)));
                      })
                    }
                  />
                </Field>

                <Field label="Tipo">
                  <OptionField
                    value={skill}
                    groups={SKILL_GROUPS}
                    searchable
                    searchPlaceholder="Buscar tipo…"
                    onChange={setSkill}
                  />
                </Field>

                <Field label="Formato">
                  <OptionField
                    value={format}
                    groups={FORMAT_GROUPS}
                    emptyLabel="Selecionar"
                    onChange={setFormat}
                  />
                </Field>
              </div>
            )}

            <Field label="Prioridade">
              <PriorityField value={priority} onChange={setPriority} />
            </Field>

            {state.error ? (
              <p role="alert" className="text-[13px] text-danger">
                {state.error}
              </p>
            ) : null}

            <ModalFooter>
              <button
                type="button"
                onClick={close}
                className="h-9 rounded-[var(--radius-control)] px-3 text-sm text-muted transition-colors hover:text-ink"
              >
                Cancelar
              </button>
              <Submit />
            </ModalFooter>
          </form>
        </Modal>
      )}
    </>
  );
}
