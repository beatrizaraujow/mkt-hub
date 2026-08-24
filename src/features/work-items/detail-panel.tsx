"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDueDate, inputFromDueDate } from "@/lib/date";
import { FORMATS, SKILLS } from "@/lib/catalog";
import { Button } from "@/components/ui/button";
import {
  addChecklistItem,
  addComment,
  deleteWorkItem,
  removeChecklistItem,
  setAssignee,
  setDescription,
  setDueDate,
  setFormat,
  setPoints,
  setPriority,
  setSkill,
  setStage,
  setTitle,
  toggleChecklistItem,
  type ActionState,
} from "./actions";

export type DetailData = {
  id: string;
  title: string;
  description: string | null;
  priority: "urgente" | "alta" | "media" | "baixa";
  dueDate: Date | null;
  completedAt: Date | null;
  points: number | null;
  skill: string | null;
  format: string | null;
  stageId: string;
  companyName: string;
  companyColor: string;
  projectName: string | null;
  assigneeId: string | null;
  stages: Array<{ id: string; name: string; kind: string }>;
  checklist: Array<{ id: string; text: string; isDone: boolean }>;
  comments: Array<{ id: string; body: string; createdAt: Date; authorName: string }>;
  activity: Array<{
    id: string;
    action: string;
    payload: Record<string, unknown>;
    createdAt: Date;
    actorName: string | null;
  }>;
};

const selectClass =
  "h-7 w-full rounded-[var(--radius-control)] border border-line bg-surface px-1.5 text-[13px] text-ink " +
  "transition-colors duration-150 focus:border-accent focus:outline-none";

const ACTION_LABEL: Record<string, string> = {
  "item.created": "criou a tarefa",
  "item.stage_changed": "mudou a etapa",
  "item.assignee_changed": "trocou o responsável",
  "item.due_changed": "mudou o prazo",
  "item.priority_changed": "mudou a prioridade",
  "item.title_changed": "renomeou",
  "item.description_changed": "editou a descrição",
  "item.points_changed": "mudou o ponto",
  "comment.created": "comentou",
};

function when(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2">
      <span className="label-mono">{label}</span>
      {children}
    </div>
  );
}

export function DetailPanel({
  item,
  people,
  today,
}: {
  item: DetailData;
  people: Array<{ id: string; name: string }>;
  today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState(item.title);
  const [draftDesc, setDraftDesc] = useState(item.description ?? "");
  const [newCheck, setNewCheck] = useState("");
  const [newComment, setNewComment] = useState("");

  function run(fn: () => Promise<ActionState>) {
    setError(null);
    start(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function close() {
    const url = new URL(window.location.href);
    url.searchParams.delete("item");
    router.replace(url.pathname + url.search, { scroll: false });
  }

  const doneCount = item.checklist.filter((c) => c.isDone).length;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-label="Detalhe da tarefa">
      <button
        type="button"
        aria-label="Fechar detalhe"
        onClick={close}
        className="flex-1 cursor-default bg-black/20"
      />

      <aside
        className={cn(
          "scroll-thin flex w-full max-w-[520px] flex-col overflow-y-auto border-l border-line bg-surface",
          pending && "opacity-80",
        )}
      >
        <header className="flex items-start gap-2 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="mb-1 flex items-center gap-1.5 text-[12px] text-faint">
              <span
                aria-hidden
                style={{ background: item.companyColor }}
                className="h-1.5 w-1.5 rounded-full"
              />
              {item.companyName}
              {item.projectName ? ` · ${item.projectName}` : ""}
            </p>
            <textarea
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={() => {
                if (draftTitle.trim() !== item.title) run(() => setTitle(item.id, draftTitle));
              }}
              rows={Math.max(1, Math.ceil(draftTitle.length / 44))}
              className="w-full resize-none border-0 bg-transparent font-display text-[19px] font-semibold leading-tight text-ink focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Fechar"
            className="mt-1 shrink-0 text-faint transition-colors hover:text-ink"
          >
            <X size={17} />
          </button>
        </header>

        {error ? (
          <p role="alert" className="border-b border-line bg-danger-soft px-5 py-2 text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        <section className="flex flex-col gap-2.5 border-b border-line px-5 py-4">
          <Field label="Etapa">
            <select
              className={selectClass}
              value={item.stageId}
              onChange={(e) => run(() => setStage(item.id, e.target.value))}
            >
              {item.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Responsável">
            <select
              className={selectClass}
              value={item.assigneeId ?? ""}
              onChange={(e) => run(() => setAssignee(item.id, e.target.value || null))}
            >
              <option value="">Sem responsável</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Prazo">
            <input
              type="date"
              className={selectClass}
              defaultValue={inputFromDueDate(item.dueDate)}
              onChange={(e) => run(() => setDueDate(item.id, e.target.value || null))}
            />
          </Field>

          <Field label="Prioridade">
            <select
              className={selectClass}
              value={item.priority}
              onChange={(e) => run(() => setPriority(item.id, e.target.value))}
            >
              <option value="urgente">Urgente</option>
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
            </select>
          </Field>

          <Field label="Ponto MKT">
            <input
              type="number"
              min={0}
              max={100}
              className={selectClass}
              defaultValue={item.points ?? ""}
              onBlur={(e) => run(() => setPoints(item.id, e.target.value))}
              placeholder="—"
            />
          </Field>

          <Field label="Tipo">
            <select
              className={selectClass}
              value={item.skill ?? ""}
              onChange={(e) => run(() => setSkill(item.id, e.target.value))}
            >
              <option value="">—</option>
              {SKILLS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Formato">
            <select
              className={selectClass}
              value={item.format ?? ""}
              onChange={(e) => run(() => setFormat(item.id, e.target.value))}
            >
              <option value="">—</option>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
        </section>

        <section className="border-b border-line px-5 py-4">
          <h3 className="label-mono mb-2">Descrição</h3>
          <textarea
            value={draftDesc}
            onChange={(e) => setDraftDesc(e.target.value)}
            onBlur={() => {
              if (draftDesc !== (item.description ?? "")) run(() => setDescription(item.id, draftDesc));
            }}
            rows={4}
            placeholder="Briefing, contexto, links…"
            className="w-full resize-y rounded-[var(--radius-control)] border border-line bg-surface p-2.5 text-[13.5px] leading-relaxed text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </section>

        <section className="border-b border-line px-5 py-4">
          <h3 className="label-mono mb-2 flex items-center gap-2">
            Checklist
            {item.checklist.length > 0 && (
              <span className="tnum opacity-70">
                {doneCount}/{item.checklist.length}
              </span>
            )}
          </h3>

          <div className="flex flex-col">
            {item.checklist.map((c) => (
              <div key={c.id} className="group flex items-center gap-2 py-1">
                <button
                  type="button"
                  aria-label={c.isDone ? "Desmarcar" : "Marcar"}
                  onClick={() => run(() => toggleChecklistItem(c.id, !c.isDone))}
                  className={cn(
                    "flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded border transition-colors",
                    c.isDone
                      ? "border-success bg-success text-white"
                      : "border-line-strong text-transparent hover:border-accent",
                  )}
                >
                  <Check size={10} strokeWidth={3} />
                </button>
                <span
                  className={cn(
                    "min-w-0 flex-1 text-[13px]",
                    c.isDone ? "text-faint line-through" : "text-ink",
                  )}
                >
                  {c.text}
                </span>
                <button
                  type="button"
                  aria-label="Remover item"
                  onClick={() => run(() => removeChecklistItem(c.id))}
                  className="shrink-0 text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          <form
            className="mt-1.5 flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newCheck.trim()) return;
              const text = newCheck;
              setNewCheck("");
              run(() => addChecklistItem(item.id, text));
            }}
          >
            <Plus size={13} className="shrink-0 text-faint" />
            <input
              value={newCheck}
              onChange={(e) => setNewCheck(e.target.value)}
              placeholder="Adicionar item"
              className="flex-1 border-0 bg-transparent text-[13px] text-ink placeholder:text-faint focus:outline-none"
            />
          </form>
        </section>

        <section className="border-b border-line px-5 py-4">
          <h3 className="label-mono mb-2">
            Comentários {item.comments.length > 0 && <span className="tnum opacity-70">{item.comments.length}</span>}
          </h3>

          <div className="mb-3 flex flex-col gap-3">
            {item.comments.map((c) => (
              <div key={c.id}>
                <p className="mb-0.5 text-[11.5px] text-faint">
                  <span className="text-muted">{c.authorName}</span> · {when(c.createdAt)}
                </p>
                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{c.body}</p>
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newComment.trim()) return;
              const body = newComment;
              setNewComment("");
              run(() => addComment(item.id, body));
            }}
          >
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={2}
              placeholder="Escrever comentário…"
              className="w-full resize-y rounded-[var(--radius-control)] border border-line bg-surface p-2.5 text-[13.5px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
            />
            {newComment.trim() && (
              <div className="mt-1.5 flex justify-end">
                <Button type="submit" size="sm" disabled={pending}>
                  Comentar
                </Button>
              </div>
            )}
          </form>
        </section>

        <section className="px-5 py-4">
          <h3 className="label-mono mb-2">Histórico</h3>
          <ul className="flex flex-col gap-1">
            {item.activity.map((a) => (
              <li key={a.id} className="text-[12.5px] text-faint">
                <span className="text-muted">{a.actorName ?? "alguém"}</span>{" "}
                {ACTION_LABEL[a.action] ?? a.action}
                {a.action === "item.stage_changed" && a.payload?.para
                  ? ` para ${String(a.payload.para)}`
                  : ""}
                {" · "}
                {when(a.createdAt)}
              </li>
            ))}
            {item.activity.length === 0 && <li className="text-[12.5px] text-faint">Nada ainda.</li>}
          </ul>
        </section>

        <footer className="mt-auto flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <span className="text-[12px] text-faint">
            {item.completedAt
              ? `Concluída ${formatDueDate(item.completedAt, today)}`
              : item.dueDate
                ? `Prazo ${formatDueDate(item.dueDate, today)}`
                : "Sem prazo"}
          </span>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm("Excluir esta tarefa? Não dá para desfazer.")) return;
              run(async () => {
                const result = await deleteWorkItem(item.id);
                if (result.ok) close();
                return result;
              });
            }}
            className="text-[12.5px] text-faint transition-colors hover:text-danger"
          >
            Excluir
          </button>
        </footer>
      </aside>
    </div>
  );
}
