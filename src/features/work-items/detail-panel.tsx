"use client";

import { useCallback, useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDueDate, formatDuration, inputFromDueDate } from "@/lib/date";
import { FORMATS, SKILLS } from "@/lib/catalog";
import { Button } from "@/components/ui/button";
import { TimerButton } from "@/features/time/timer-button";
import { useNowSeconds } from "@/features/time/use-now";
import { logManualTime } from "@/features/time/actions";
import type { TimeEntryRow, TimeSummary } from "@/features/time/queries";
import {
  addChecklistItem,
  addComment,
  addSubtask,
  completeWorkItem,
  deleteWorkItem,
  removeChecklistItem,
  reopenWorkItem,
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
import { useOpenItem } from "./use-open-item";
import { AttachmentList, type AttachmentRow } from "@/features/attachments/attachment-list";

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
  subtasks: Array<{
    id: string;
    title: string;
    completedAt: Date | null;
    assigneeName: string | null;
  }>;
  files: AttachmentRow[];
  comments: Array<{ id: string; body: string; createdAt: Date; authorName: string }>;
  activity: Array<{
    id: string;
    action: string;
    payload: Record<string, unknown>;
    createdAt: Date;
    actorName: string | null;
  }>;
};

type Tab = "trabalho" | "conversa" | "tempo" | "historico";

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
  "subtask.created": "criou uma subtarefa",
};

const PRIORITIES = [
  { value: "baixa", label: "Baixa", color: "var(--p-baixa)" },
  { value: "media", label: "Média", color: "var(--p-media)" },
  { value: "alta", label: "Alta", color: "var(--p-alta)" },
  { value: "urgente", label: "Urgente", color: "var(--p-urgente)" },
] as const;

const field =
  "h-7 w-full rounded-[var(--radius-control)] border border-line bg-surface px-2 text-[13px] text-ink " +
  "transition-colors duration-150 focus:border-accent focus:outline-none";

function when(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function dayOnly(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
  }).format(date);
}

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function clock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[9.5px] font-semibold text-accent">
      {initials(name)}
    </span>
  );
}

function RailLabel({ children }: { children: React.ReactNode }) {
  return <div className="label-mono mb-1.5">{children}</div>;
}

export function DetailPanel({
  item,
  people,
  today,
  summary,
  entries,
  timerRunning,
  runningSince,
  runningSubtaskId,
  storageOn,
}: {
  item: DetailData;
  people: Array<{ id: string; name: string }>;
  today: string;
  summary: TimeSummary;
  entries: TimeEntryRow[];
  timerRunning: boolean;
  runningSince: Date | null;
  runningSubtaskId: string | null;
  storageOn: boolean;
}) {
  const router = useRouter();
  const openItem = useOpenItem();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("trabalho");
  const [draftTitle, setDraftTitle] = useState(item.title);
  const [draftDesc, setDraftDesc] = useState(item.description ?? "");
  const [newCheck, setNewCheck] = useState("");
  const [newSub, setNewSub] = useState("");
  const [newComment, setNewComment] = useState("");
  const [manual, setManual] = useState(false);
  const [manualMin, setManualMin] = useState("");
  const [manualDay, setManualDay] = useState(today);

  // A etapa muda na hora. Se o servidor recusar, volta sozinha.
  const [shownStageId, setShownStage] = useOptimistic(item.stageId);

  const anyTimer = timerRunning || Boolean(runningSubtaskId);
  const now = useNowSeconds(anyTimer);
  const live =
    anyTimer && runningSince && now > 0
      ? Math.max(0, now - Math.floor(runningSince.getTime() / 1000))
      : 0;

  function run(fn: () => Promise<ActionState>) {
    setError(null);
    start(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
    });
  }

  const close = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("item");
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [close]);

  const done = Boolean(item.completedAt);
  const subDone = item.subtasks.filter((s) => s.completedAt).length;
  const checkDone = item.checklist.filter((c) => c.isDone).length;

  const TABS: Array<{ key: Tab; label: string; count?: number }> = [
    { key: "trabalho", label: "Trabalho" },
    { key: "conversa", label: "Conversa", count: item.comments.length },
    { key: "tempo", label: "Tempo", count: entries.length },
    { key: "historico", label: "Histórico", count: item.activity.length },
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6">
      <div
        aria-hidden
        onMouseDown={close}
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Detalhe da tarefa"
        className={cn(
          "relative z-10 flex max-h-[90vh] w-full max-w-[900px] flex-col overflow-hidden",
          "rounded-[var(--radius-card)] border border-line bg-surface",
          "shadow-[0_24px_64px_rgba(0,0,0,0.32)]",
        )}
      >
        {/* ------------------------------------------------------------ topo */}
        <header className="px-5 pt-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="mb-1 flex items-center gap-2 text-[12px] text-faint">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    style={{ background: item.companyColor }}
                    className="h-1.5 w-1.5 rounded-full"
                  />
                  {item.companyName}
                </span>
                {item.projectName ? (
                  <>
                    <span className="text-line-strong">/</span>
                    <span>{item.projectName}</span>
                  </>
                ) : null}
              </p>
              <textarea
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onBlur={() => {
                  if (draftTitle.trim() !== item.title) run(() => setTitle(item.id, draftTitle));
                }}
                rows={draftTitle.length > 62 ? 2 : 1}
                className="w-full resize-none border-0 bg-transparent font-display text-[20px] font-semibold leading-tight text-ink focus:outline-none"
              />
            </div>

            <div className="flex flex-none items-center gap-2">
              {anyTimer && (
                <span className="inline-flex h-[30px] items-center gap-2 rounded-[var(--radius-control)] bg-accent-soft px-2.5 text-[13px] font-medium text-accent">
                  <span className="relative flex h-[7px] w-[7px]">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                    <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-accent" />
                  </span>
                  <span suppressHydrationWarning className="tnum min-w-[56px]">
                    {clock(live)}
                  </span>
                </span>
              )}

              <Button
                size="sm"
                variant={done ? "subtle" : "primary"}
                onClick={() =>
                  run(() => (done ? reopenWorkItem(item.id) : completeWorkItem(item.id)))
                }
                disabled={pending}
              >
                <Check size={13} strokeWidth={3} />
                {done ? "Reabrir" : "Concluir"}
              </Button>

              <button
                type="button"
                onClick={close}
                aria-label="Fechar"
                className="text-faint transition-colors hover:text-ink"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* Trilha de etapas: onde está e para onde vai, num clique. */}
          <div className="mt-3.5 flex gap-[2px]">
            {item.stages.map((stage, i) => {
              const active = stage.id === shownStageId;
              return (
                <button
                  key={stage.id}
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      setShownStage(stage.id);
                      return setStage(item.id, stage.id);
                    })
                  }
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-[12.5px] transition-colors duration-150",
                    i === 0 && "rounded-l-[7px]",
                    i === item.stages.length - 1 && "rounded-r-[7px]",
                    active
                      ? "bg-accent-soft font-medium text-accent"
                      : "bg-sunk text-faint hover:text-ink",
                  )}
                >
                  {active && <span aria-hidden className="h-[5px] w-[5px] rounded-full bg-accent" />}
                  <span className="truncate">{stage.name}</span>
                </button>
              );
            })}
          </div>
        </header>

        {/* Progresso sem apagar a tela: o conteudo continua legivel. */}
        <div aria-hidden className="relative mt-4 h-[2px] overflow-hidden bg-line">
          {pending && <div className="absolute inset-y-0 left-0 w-1/3 animate-[slide_1s_ease-in-out_infinite] bg-accent" />}
        </div>

        {error ? (
          <p role="alert" className="bg-danger-soft px-5 py-2 text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        {/* ----------------------------------------------------------- corpo */}
        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_264px]">
          <div className="flex min-w-0 flex-col border-line md:border-r">
            <div className="flex gap-4 border-b border-line px-5 pt-3">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  aria-pressed={tab === t.key}
                  className={cn(
                    "border-b-2 pb-2 text-[13px] transition-colors duration-150",
                    tab === t.key
                      ? "border-accent text-ink"
                      : "border-transparent text-faint hover:text-muted",
                  )}
                >
                  {t.label}
                  {t.count ? <span className="tnum ml-1 opacity-60">{t.count}</span> : null}
                </button>
              ))}
            </div>

            <div className="scroll-thin min-h-[320px] flex-1 overflow-y-auto px-5 py-4">
              {tab === "trabalho" && (
                <div className="flex flex-col gap-5">
                  <section>
                    <h3 className="label-mono mb-2">Briefing</h3>
                    <textarea
                      value={draftDesc}
                      onChange={(e) => setDraftDesc(e.target.value)}
                      onBlur={() => {
                        if (draftDesc !== (item.description ?? "")) {
                          run(() => setDescription(item.id, draftDesc));
                        }
                      }}
                      rows={3}
                      placeholder="Contexto, referências, links…"
                      className="w-full resize-y rounded-[var(--radius-control)] border border-line bg-surface p-2.5 text-[13.5px] leading-relaxed text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                    />
                  </section>

                  <section>
                    <h3 className="label-mono mb-2 flex items-center gap-2">
                      <span>Subtarefas</span>
                      {item.subtasks.length > 0 && (
                        <span className="tnum opacity-70">
                          {subDone}/{item.subtasks.length}
                        </span>
                      )}
                      {summary.subtasks > 0 && (
                        <span className="tnum ml-auto">{formatDuration(summary.subtasks)}</span>
                      )}
                    </h3>

                    <div className="flex flex-col">
                      {item.subtasks.map((sub) => {
                        const subOk = Boolean(sub.completedAt);
                        return (
                          <div
                            key={sub.id}
                            className="group flex items-center gap-2 rounded-[var(--radius-control)] px-1 py-1 hover:bg-hover"
                          >
                            <button
                              type="button"
                              aria-label={subOk ? "Reabrir subtarefa" : "Concluir subtarefa"}
                              onClick={() =>
                                run(() => (subOk ? reopenWorkItem(sub.id) : completeWorkItem(sub.id)))
                              }
                              className={cn(
                                "flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border transition-colors",
                                subOk
                                  ? "border-success bg-success text-white"
                                  : "border-line-strong text-transparent hover:border-accent",
                              )}
                            >
                              <Check size={10} strokeWidth={3} />
                            </button>

                            {!subOk && (
                              <TimerButton
                                workItemId={sub.id}
                                isRunning={runningSubtaskId === sub.id}
                                size={13}
                              />
                            )}

                            <button
                              type="button"
                              onClick={() => openItem(sub.id)}
                              className={cn(
                                "min-w-0 flex-1 truncate text-left text-[13px]",
                                subOk ? "text-faint line-through" : "text-ink",
                              )}
                            >
                              {sub.title}
                            </button>

                            {summary.bySubtask[sub.id] ? (
                              <span className="tnum shrink-0 text-[11.5px] text-faint">
                                {formatDuration(summary.bySubtask[sub.id])}
                              </span>
                            ) : null}

                            {sub.assigneeName ? (
                              <span className="shrink-0 text-[11.5px] text-faint">
                                {initials(sub.assigneeName)}
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    <form
                      className="mt-1 flex items-center gap-1.5 px-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!newSub.trim()) return;
                        const title = newSub;
                        setNewSub("");
                        run(() => addSubtask(item.id, title));
                      }}
                    >
                      <Plus size={13} className="shrink-0 text-faint" />
                      <input
                        value={newSub}
                        onChange={(e) => setNewSub(e.target.value)}
                        placeholder="Nova subtarefa"
                        className="flex-1 border-0 bg-transparent text-[13px] text-ink placeholder:text-faint focus:outline-none"
                      />
                    </form>
                  </section>

                  <AttachmentList
                    workItemId={item.id}
                    items={item.files}
                    storageOn={storageOn}
                  />

                  <section>
                    <h3 className="label-mono mb-2 flex items-center gap-2">
                      <span>Checklist</span>
                      {item.checklist.length > 0 && (
                        <span className="tnum opacity-70">
                          {checkDone}/{item.checklist.length}
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
                      className="mt-1 flex items-center gap-1.5"
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
                        placeholder="Adicionar marcador"
                        className="flex-1 border-0 bg-transparent text-[13px] text-ink placeholder:text-faint focus:outline-none"
                      />
                    </form>
                  </section>
                </div>
              )}

              {tab === "conversa" && (
                <div className="flex min-h-full flex-col gap-4">
                  {item.comments.length === 0 && (
                    <p className="text-[13px] text-faint">
                      Nada conversado ainda. Mudança de etapa e de campo fica no Histórico — aqui é
                      só gente.
                    </p>
                  )}

                  {item.comments.map((c) => (
                    <div key={c.id} className="flex gap-2.5">
                      <Avatar name={c.authorName} />
                      <div className="min-w-0">
                        <p className="mb-0.5 text-[11.5px] text-faint">
                          <span className="font-medium text-muted">{c.authorName}</span> ·{" "}
                          {when(c.createdAt)}
                        </p>
                        <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
                          {c.body}
                        </p>
                      </div>
                    </div>
                  ))}

                  <form
                    className="mt-auto pt-2"
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
                </div>
              )}

              {tab === "tempo" && (
                <div className="flex flex-col gap-1">
                  {entries.length === 0 && (
                    <p className="text-[13px] text-faint">Nenhum tempo registrado ainda.</p>
                  )}

                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-2.5 border-b border-line py-1.5 last:border-b-0"
                    >
                      <span className="tnum w-[54px] shrink-0 text-[13px] font-medium text-ink">
                        {formatDuration(entry.durationSeconds ?? 0)}
                      </span>
                      <span className="tnum w-[54px] shrink-0 text-[12px] text-faint">
                        {dayOnly(entry.startedAt)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">
                        {entry.isSubtask ? `↳ ${entry.fromTitle}` : entry.fromTitle}
                      </span>
                      {entry.autoClosed && !entry.confirmedAt && (
                        <span className="shrink-0 rounded border border-warning/40 bg-warning-soft px-1.5 py-0.5 text-[10.5px] text-warning">
                          a confirmar
                        </span>
                      )}
                      <span className="shrink-0 text-[11.5px] text-faint">
                        {entry.userName ? initials(entry.userName) : "—"}
                      </span>
                    </div>
                  ))}

                  {manual ? (
                    <form
                      className="mt-2 flex flex-wrap items-end gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        run(async () => {
                          const result = await logManualTime(item.id, manualMin, manualDay);
                          if (result.ok) {
                            setManualMin("");
                            setManual(false);
                          }
                          return result;
                        });
                      }}
                    >
                      <input
                        type="number"
                        min={1}
                        autoFocus
                        value={manualMin}
                        onChange={(e) => setManualMin(e.target.value)}
                        placeholder="min"
                        className={cn(field, "w-[84px]")}
                      />
                      <input
                        type="date"
                        value={manualDay}
                        onChange={(e) => setManualDay(e.target.value)}
                        className={cn(field, "w-[150px]")}
                      />
                      <Button type="submit" size="sm" disabled={pending}>
                        Lançar
                      </Button>
                      <button
                        type="button"
                        onClick={() => setManual(false)}
                        className="text-[12.5px] text-faint hover:text-ink"
                      >
                        Cancelar
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setManual(true)}
                      className="mt-2 self-start text-[12.5px] text-faint transition-colors hover:text-ink"
                    >
                      + Lançar manual
                    </button>
                  )}
                </div>
              )}

              {tab === "historico" && (
                <ul className="flex flex-col gap-1">
                  {item.activity.length === 0 && (
                    <li className="text-[13px] text-faint">Nada ainda.</li>
                  )}
                  {item.activity.map((a) => (
                    <li key={a.id} className="text-[12.5px] text-faint">
                      <span className="text-muted">{a.actorName ?? "alguém"}</span>{" "}
                      {ACTION_LABEL[a.action] ?? a.action}
                      {a.payload?.de && a.payload?.para ? (
                        <>
                          {" "}
                          <span className="text-muted">{String(a.payload.de)}</span> →{" "}
                          <span className="text-ink">{String(a.payload.para)}</span>
                        </>
                      ) : a.payload?.para !== undefined && a.payload?.para !== null ? (
                        <>
                          {" para "}
                          <span className="text-ink">{String(a.payload.para)}</span>
                        </>
                      ) : null}
                      {" · "}
                      {when(a.createdAt)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* ---------------------------------------------------------- trilho */}
          <aside className="scroll-thin flex flex-col gap-4 overflow-y-auto border-t border-line bg-sunk p-4 md:border-t-0">
            <div className="rounded-[var(--radius-control)] bg-accent-soft p-2.5">
              <div className="label-mono mb-1.5 !text-accent opacity-80">Tempo</div>
              <div className="flex items-center gap-2.5">
                <TimerButton workItemId={item.id} isRunning={timerRunning} size={18} />
                <span
                  suppressHydrationWarning
                  className="tnum font-display text-[19px] font-semibold text-ink"
                >
                  {anyTimer ? clock(live) : formatDuration(summary.own)}
                </span>
              </div>
              <p className="mt-1.5 text-[11.5px] text-accent">
                {timerRunning
                  ? `contando agora · total ${formatDuration(summary.own)}`
                  : runningSubtaskId
                    ? "contando numa subtarefa"
                    : "registradas nesta tarefa"}
              </p>
              {summary.subtasks > 0 && (
                <p className="mt-1 flex items-center justify-between text-[11.5px] text-muted">
                  <span>Nas subtarefas</span>
                  <span className="tnum">{formatDuration(summary.subtasks)}</span>
                </p>
              )}
            </div>

            <div>
              <RailLabel>Responsável</RailLabel>
              <select
                className={field}
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
            </div>

            <div>
              <RailLabel>Prazo</RailLabel>
              <input
                type="date"
                className={field}
                defaultValue={inputFromDueDate(item.dueDate)}
                onChange={(e) => run(() => setDueDate(item.id, e.target.value || null))}
              />
              {item.dueDate && !done ? (
                <p className="mt-1 text-[11.5px] text-faint">{formatDueDate(item.dueDate, today)}</p>
              ) : null}
            </div>

            <div>
              <RailLabel>Prioridade</RailLabel>
              <div className="flex gap-[2px]">
                {PRIORITIES.map((p) => {
                  const active = item.priority === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => setPriority(item.id, p.value))}
                      style={active ? { color: p.color } : undefined}
                      className={cn(
                        "h-[22px] flex-1 rounded-[6px] text-[11.5px] transition-colors duration-150",
                        active ? "bg-surface font-medium" : "text-faint hover:text-muted",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <RailLabel>Ponto MKT</RailLabel>
              <input
                type="number"
                min={0}
                max={100}
                className={field}
                defaultValue={item.points ?? ""}
                onBlur={(e) => run(() => setPoints(item.id, e.target.value))}
                placeholder="—"
              />
            </div>

            <div>
              <RailLabel>Tipo</RailLabel>
              <select
                className={field}
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
            </div>

            <div>
              <RailLabel>Formato</RailLabel>
              <select
                className={field}
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
            </div>

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
              className="mt-auto self-start text-[12.5px] text-faint transition-colors hover:text-danger"
            >
              Excluir tarefa
            </button>
          </aside>
        </div>
      </aside>
    </div>
  );
}
