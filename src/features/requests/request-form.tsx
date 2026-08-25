"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { REQUEST_TYPES, type RequestType } from "@/lib/catalog";
import { QUESTIONS } from "@/lib/request-questions";
import { submitRequest, type RequestState } from "./actions";
import type { CompanyChoice } from "./queries";

export type RequestFormData = {
  /** Nulo no formulario geral, que oferece todas as empresas. */
  slug: string | null;
  title: string | null;
  companies: CompanyChoice[];
  projects: Array<{ id: string; name: string; companyId: string }>;
};

const control =
  "h-[42px] w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 " +
  "text-[14px] text-ink placeholder:text-faint focus:border-accent focus:outline-none";

const area =
  "w-full resize-y rounded-[var(--radius-control)] border border-line bg-surface p-3 " +
  "text-[14px] leading-relaxed text-ink placeholder:text-faint focus:border-accent focus:outline-none";

function Label({
  children,
  hint,
  optional,
}: {
  children: React.ReactNode;
  hint?: string;
  optional?: boolean;
}) {
  return (
    <span className="mb-1.5 flex items-baseline gap-2">
      <span className="text-[13px] font-medium text-ink">{children}</span>
      {optional ? <span className="text-[11.5px] text-faint">opcional</span> : null}
      {hint ? <span className="text-[11.5px] text-faint">{hint}</span> : null}
    </span>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Enviando…" : "Enviar pedido"}
    </Button>
  );
}

export function RequestForm({ data, today }: { data: RequestFormData; today: string }) {
  const [state, action] = useActionState<RequestState, FormData>(submitRequest, {});
  const [requestType, setRequestType] = useState<RequestType>(REQUEST_TYPES[0]);
  const [companyId, setCompanyId] = useState(data.companies[0]?.id ?? "");

  const questions = QUESTIONS[requestType];
  const projects = data.projects.filter((p) => p.companyId === companyId);

  /**
   * Mae solta, filhas sob o nome da mae. A lista ja chega ordenada; aqui e
   * so a quebra em blocos que o `optgroup` pede.
   */
  const groups: Array<{ label: string | null; items: CompanyChoice[] }> = [];
  for (const company of data.companies) {
    const last = groups[groups.length - 1];
    if (last && last.label === company.group) last.items.push(company);
    else groups.push({ label: company.group, items: [company] });
  }

  if (state.ok) {
    return (
      <div className="rounded-[var(--radius-card)] border border-line bg-surface px-6 py-10 text-center">
        <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Check size={22} strokeWidth={2.5} />
        </span>
        <p className="font-display text-[19px] font-semibold text-ink">Pedido enviado</p>
        <p className="mx-auto mt-2 max-w-[420px] text-[14px] leading-relaxed text-muted">
          O time de marketing recebeu e vai avaliar. Se faltar alguma informação, alguém entra em
          contato pelo e-mail que você deixou.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 text-[13px] text-accent hover:underline"
        >
          Enviar outro pedido
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="slug" value={data.slug ?? ""} />
      <input type="hidden" name="requestType" value={requestType} />

      {/* Armadilha para robo. Invisivel e fora da ordem de tabulacao. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="absolute h-0 w-0 opacity-0"
      />

      <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <h2 className="label-mono mb-4">Quem está pedindo</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col">
            <Label>Seu nome</Label>
            <input name="requesterName" required maxLength={120} className={control} />
          </label>

          <label className="flex flex-col">
            <Label>E-mail</Label>
            <input
              type="email"
              name="requesterEmail"
              required
              maxLength={160}
              placeholder="para o time responder"
              className={control}
            />
          </label>

          <label className="flex flex-col">
            <Label optional>WhatsApp</Label>
            <input name="requesterPhone" maxLength={40} placeholder="(84) 9…" className={control} />
          </label>

          <label className="flex flex-col">
            <Label>Empresa</Label>
            <select
              name="companyId"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className={cn(control, "cursor-pointer")}
            >
              {/* Sub-marca aparece dentro da mae: a lista fica curta de ler. */}
              {groups.map((group) =>
                group.label ? (
                  <optgroup key={group.label} label={group.label}>
                    {group.items.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  group.items.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))
                ),
              )}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <h2 className="label-mono mb-4">O pedido</h2>

        <div className="flex flex-col gap-4">
          <div>
            <Label hint="isso define o que perguntamos a seguir">Tipo de demanda</Label>
            <div className="flex flex-wrap gap-1.5">
              {REQUEST_TYPES.map((option) => {
                const active = option === requestType;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setRequestType(option)}
                    className={cn(
                      "h-[32px] rounded-[var(--radius-control)] border px-3 text-[13px] transition-colors duration-150",
                      active
                        ? "border-accent bg-accent-soft font-medium text-accent"
                        : "border-line text-muted hover:border-line-strong hover:text-ink",
                    )}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex flex-col">
            <Label>Em uma linha, o que você precisa</Label>
            <input
              name="title"
              required
              maxLength={200}
              placeholder="Ex.: post de aniversário da loja do Alecrim"
              className={control}
            />
          </label>

          <label className="flex flex-col">
            <Label hint="para que serve, o que precisa acontecer depois">Objetivo</Label>
            <textarea
              name="objective"
              required
              rows={4}
              maxLength={4000}
              placeholder="O que você espera que aconteça quando isso estiver no ar."
              className={area}
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col">
              <Label hint="quando você precisa">Para quando</Label>
              <input type="date" name="dueDate" min={today} className={control} />
            </label>

            {projects.length > 0 && (
              <label className="flex flex-col">
                <Label optional>Projeto</Label>
                <select name="projectId" className={cn(control, "cursor-pointer")}>
                  <option value="">Nenhum</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      </section>

      {questions.length > 0 && (
        <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <h2 className="label-mono mb-4">Sobre {requestType.toLowerCase()}</h2>

          <div className="flex flex-col gap-4">
            {questions.map((question) => (
              <label key={question.key} className="flex flex-col">
                <Label optional={!question.required}>{question.label}</Label>

                {question.kind === "textarea" ? (
                  <textarea
                    name={`q_${question.key}`}
                    rows={3}
                    maxLength={2000}
                    placeholder={question.placeholder}
                    className={area}
                  />
                ) : question.kind === "select" ? (
                  <select name={`q_${question.key}`} className={cn(control, "cursor-pointer")}>
                    {question.options?.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    name={`q_${question.key}`}
                    maxLength={2000}
                    placeholder={question.placeholder}
                    className={control}
                  />
                )}
              </label>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
        <h2 className="label-mono mb-4">Referências</h2>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col">
            <Label optional hint="links de exemplos, arquivos, textos prontos">
              Links
            </Label>
            <textarea
              name="references"
              rows={3}
              maxLength={4000}
              placeholder="Cole aqui os links do Drive, do post que você gostou, do material bruto…"
              className={area}
            />
          </label>

          <label className="flex flex-col">
            <Label optional>Mais alguma coisa</Label>
            <textarea name="notes" rows={3} maxLength={4000} className={area} />
          </label>
        </div>
      </section>

      {state.error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] border border-danger/40 bg-danger/10 px-3 py-2 text-[13.5px] text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Submit />
        <p className="text-[12px] text-faint">
          O pedido entra na fila de triagem. Nada é produzido antes de alguém do time aceitar.
        </p>
      </div>
    </form>
  );
}
