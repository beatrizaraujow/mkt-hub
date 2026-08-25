"use client";

import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { FORMAT_GROUPS, PRIORITY_LABEL, SKILL_GROUPS } from "@/lib/catalog";
import { addSubtask } from "./actions";
import {
  AssigneeField,
  DueDateField,
  Field,
  OptionField,
  PointsField,
  PriorityField,
  type PersonOption,
} from "./field-controls";

/** O controle devolve string; o servidor so aceita uma das quatro. */
function asPriority(value: string) {
  return value in PRIORITY_LABEL ? (value as keyof typeof PRIORITY_LABEL) : null;
}

/**
 * Mesma caixa de Nova tarefa, sem Empresa e sem Projeto: subtarefa mora na
 * empresa do pai por definicao. Os campos ja chegam preenchidos com o que a
 * subtarefa herdaria, entao digitar o titulo e apertar Enter continua dando
 * exatamente o resultado de antes.
 */
export function SubtaskCreate({
  parentId,
  parentTitle,
  people,
  meId,
  today,
  inherited,
  onClose,
}: {
  parentId: string;
  parentTitle: string;
  people: PersonOption[];
  meId: string;
  today: string;
  inherited: { assigneeId: string | null; dueDate: string; priority: string };
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState(false);

  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | null>(inherited.assigneeId);
  const [dueDate, setDueDate] = useState(inherited.dueDate);
  const [priority, setPriority] = useState(inherited.priority);
  const [points, setPoints] = useState("");
  const [skill, setSkill] = useState("");
  const [format, setFormat] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || pending) return;
    setError(null);

    start(async () => {
      const result = await addSubtask(parentId, {
        title,
        assigneeId,
        dueDate,
        priority: asPriority(priority),
        points: points === "" ? null : points,
        skill: skill || null,
        format: format || null,
      });

      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <Modal
      label="Nova subtarefa"
      title="Nova subtarefa"
      subtitle={`Dentro de ${parentTitle}`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="flex flex-col gap-4 px-5 py-4">
        <Field label="Subtarefa">
          <input
            autoFocus
            required
            autoComplete="off"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Que pedaço é esse?"
            className="h-[42px] w-full rounded-[var(--radius-control)] border border-accent bg-surface px-3 text-[14px] text-ink placeholder:text-faint focus:outline-none"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field label="Responsável">
            <AssigneeField
              value={assigneeId}
              people={people}
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
          <ChevronDown size={13} className={cn("transition-transform", details && "rotate-180")} />
          {details ? "menos detalhes" : "mais detalhes"}
        </button>

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

        {error ? (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-[var(--radius-control)] px-3 text-sm text-muted transition-colors hover:text-ink"
          >
            Cancelar
          </button>
          <Button type="submit" size="md" disabled={pending}>
            {pending ? "Criando…" : "Criar subtarefa"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
