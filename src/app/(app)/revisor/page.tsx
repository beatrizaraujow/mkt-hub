import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, BarChart3, Check, FileText, Link2, SlidersHorizontal, X } from "lucide-react";
import { assertCanManage, requireUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { EmptyState, PageHeader } from "@/components/page-header";
import { diagnosableItems, diagnose } from "@/features/review/diagnose";
import { RequestReview } from "@/features/review/request-review";
import { PromptPreview } from "@/features/review/prompt-preview";

export const metadata: Metadata = { title: "Revisor · MKT Hub" };
export const dynamic = "force-dynamic";

const VERIFIER_LABEL = {
  maquina: "Máquina",
  pessoa: "Pessoa",
  fora: "Fora de escopo",
} as const;

/**
 * O veredito e binario e nomeavel. A cor separa o que barra do que ajusta —
 * e nao existe nota nenhuma para colorir, de proposito.
 */
const VERDICT = {
  aprovado: { label: "aprovado", className: "text-success" },
  ajustar: { label: "ajustar", className: "text-warning" },
  reprovado: { label: "reprovado", className: "text-danger" },
} as const;

const STATUS_LABEL: Record<string, string> = {
  pendente: "na fila",
  rodando: "rodando",
  emitido: "parecer emitido",
  incompleto: "entrada incompleta",
  falhou: "falhou",
};

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <h2 className="label-mono mb-1">{title}</h2>
      {hint ? <p className="mb-3 text-[12px] text-faint">{hint}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-1.5 last:border-b-0">
      <span className="text-[12.5px] text-faint">{label}</span>
      <span className={cn("text-[13px]", value ? "text-ink" : "text-faint")}>{value ?? "—"}</span>
    </div>
  );
}

export default async function RevisorPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const user = await requireUser();
  assertCanManage(user);

  const params = await searchParams;
  const candidates = await diagnosableItems(user);
  const data = params.item ? await diagnose(user, params.item) : null;

  return (
    <>
      <PageHeader
        title="Revisor"
        description="Aponte para uma entrega real e veja o que o sistema entendeu."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/revisor/medicao"
              className="flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-3 text-[13px] text-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              <BarChart3 size={14} />
              Medição
            </Link>
            <Link
              href="/revisor/regras"
              className="flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-3 text-[13px] text-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              <SlidersHorizontal size={14} />
              Regras
            </Link>
          </div>
        }
      />

      <div className="flex max-w-[820px] flex-col gap-4 px-5 py-5 md:px-7">
        <form
          method="get"
          className="flex flex-wrap items-end gap-2 rounded-[var(--radius-card)] border border-dashed border-line p-4"
        >
          <label className="flex min-w-[260px] flex-1 flex-col gap-1.5">
            <span className="label-mono">Entrega</span>
            <select
              name="item"
              defaultValue={params.item ?? ""}
              className="h-[38px] w-full cursor-pointer rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[13.5px] text-ink focus:border-accent focus:outline-none"
            >
              <option value="">Escolha uma tarefa…</option>
              {candidates.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.companyName} · {row.title}
                  {row.skill ? ` (${row.skill})` : ""}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="h-[38px] rounded-[var(--radius-control)] border border-line px-3 text-[13px] text-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            Diagnosticar
          </button>
        </form>

        {!data ? (
          <EmptyState
            title="Nenhuma entrega selecionada"
            description="Escolha uma tarefa acima para ver o recorte, as regras que se aplicam e o que o porteiro barraria."
          />
        ) : (
          <>
            <Section title="O que o sistema vê" hint="É daqui que sai o recorte das regras.">
              <div className="flex flex-col">
                <Fact label="Tarefa" value={data.item.title} />
                <Fact label="Empresa" value={data.item.companyName} />
                <Fact label="Projeto" value={data.item.projectName} />
                <Fact label="Etapa" value={data.item.stageName} />
                <Fact label="Tipo" value={data.item.skill} />
                <Fact label="Formato" value={data.item.format} />
                <Fact
                  label="Copy"
                  value={
                    data.item.copy
                      ? `${data.item.copy.trim().length} caracteres`
                      : null
                  }
                />
                <Fact
                  label="Arquivos"
                  value={
                    data.files.length
                      ? `${data.files.filter((f) => f.kind === "file").length} arquivo(s), ${
                          data.files.filter((f) => f.kind === "link").length
                        } link(s)`
                      : null
                  }
                />
              </div>

              {data.files.length > 0 && (
                <div className="mt-2 flex flex-col gap-0.5">
                  {data.files.map((file) => (
                    <div key={file.id} className="flex items-center gap-2 text-[12.5px] text-muted">
                      {file.kind === "link" ? <Link2 size={12} /> : <FileText size={12} />}
                      <span className="truncate">{file.filename}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section
              title="Porteiro"
              hint="Roda antes de gastar IA. Barra entrada incompleta e diz o que falta."
            >
              {data.gate.ok ? (
                <p className="flex items-center gap-2 text-[13.5px] text-success">
                  <Check size={15} strokeWidth={2.5} />
                  Passa. {data.gate.ruleCount} regra(s) de máquina para “{data.gate.skill}”.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {data.gate.missing.map((reason) => (
                    <li key={reason} className="flex gap-2 text-[13.5px] text-ink">
                      <X size={15} className="mt-[2px] shrink-0 text-danger" />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section
              title="Regras que se aplicam"
              hint="As camadas se somam: o que vale para todos, para a empresa e para o tipo de peça."
            >
              {data.rules.length === 0 ? (
                <p className="flex gap-2 text-[13px] text-muted">
                  <AlertTriangle size={15} className="mt-[2px] shrink-0 text-warning" />
                  <span>
                    Nenhuma regra cadastrada para este recorte. Enquanto não houver, o revisor não
                    emite parecer — e é assim que tem que ser: preencher o buraco com boa prática de
                    mercado seria pior que deixá-lo visível.
                  </span>
                </p>
              ) : (
                <div className="flex flex-col">
                  {data.rules.map((rule) => (
                    <div key={rule.id} className="border-b border-line py-2 last:border-b-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="rounded-[5px] bg-sunk px-1.5 py-0.5 font-mono text-[11.5px] text-muted">
                          {rule.code}
                        </code>
                        <span
                          className={cn(
                            "rounded-[5px] px-1.5 py-0.5 text-[11px]",
                            rule.verifier === "maquina"
                              ? "bg-accent-soft text-accent"
                              : "bg-sunk text-faint",
                          )}
                        >
                          {VERIFIER_LABEL[rule.verifier]}
                        </span>
                        {rule.isBlocking && (
                          <span className="rounded-[5px] border border-danger/40 px-1.5 py-0.5 text-[11px] text-danger">
                            inegociável
                          </span>
                        )}
                        <span className="ml-auto text-[11.5px] text-faint">{rule.scopeLabel}</span>
                      </div>
                      <p className="mt-1 text-[13px] leading-relaxed text-ink">{rule.text}</p>
                      {rule.rationale && (
                        <p className="mt-0.5 text-[12px] text-faint">{rule.rationale}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {data.overlaps.length > 0 && (
              <Section
                title="Sobreposição entre camadas"
                hint="Conflito silencioso é bug: quando uma regra substitui outra, isso aparece."
              >
                <ul className="flex flex-col gap-2">
                  {data.overlaps.map((overlap) => (
                    <li key={`${overlap.winner}-${overlap.loser}`} className="text-[13px]">
                      <span className="text-ink">
                        {overlap.applied ? (
                          <>
                            <code className="font-mono text-[12px]">{overlap.winner}</code>{" "}
                            substituiu{" "}
                            <code className="font-mono text-[12px]">{overlap.loser}</code>
                          </>
                        ) : (
                          <>
                            <code className="font-mono text-[12px]">{overlap.loser}</code> diz
                            substituir{" "}
                            <code className="font-mono text-[12px]">{overlap.winner}</code>, e o
                            sistema não aceitou
                          </>
                        )}
                      </span>
                      <p className="text-[12px] text-faint">{overlap.why}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section
              title="O pedido que iria para o modelo"
              hint="Montado pela mesma função que o julgamento usa, sem gastar chamada."
            >
              {"error" in data.prompt ? (
                <p className="text-[13px] text-faint">{data.prompt.error}</p>
              ) : (
                <PromptPreview system={data.prompt.system} briefing={data.prompt.briefing} />
              )}
            </Section>

            <Section
              title="Checklist da pessoa"
              hint="Cobre o que a máquina não pega. Item repetido vira marcação automática em duas semanas."
            >
              {data.checklist.length === 0 ? (
                <p className="text-[13px] text-faint">Nenhum item cadastrado para este recorte.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {data.checklist.map((item) => (
                    <li key={item.id} className="flex items-baseline gap-2 text-[13px] text-ink">
                      <span aria-hidden className="text-faint">
                        ·
                      </span>
                      <span>{item.text}</span>
                      {item.isReliabilityProbe && (
                        <span className="text-[11px] text-faint">(medidor de confiabilidade)</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Revisões desta entrega" hint="Cada rodada é uma linha nova.">
              {data.cycles.length === 0 ? (
                <p className="text-[13px] text-faint">Nenhuma revisão pedida ainda.</p>
              ) : (
                <div className="flex flex-col">
                  {data.cycles.map((cycle) => (
                    <div key={cycle.id} className="border-b border-line py-2.5 last:border-b-0">
                      <div className="flex flex-wrap items-center gap-2 text-[13px]">
                        <span className="tnum text-faint">rodada {cycle.round}</span>
                        <span className="text-ink">{STATUS_LABEL[cycle.status] ?? cycle.status}</span>
                        <span className="text-faint">
                          · {cycle.attempts} tentativa{cycle.attempts === 1 ? "" : "s"}
                        </span>
                        {cycle.verdict && (
                          <span
                            className={cn(
                              "font-medium",
                              VERDICT[cycle.verdict as keyof typeof VERDICT]?.className,
                            )}
                          >
                            · {VERDICT[cycle.verdict as keyof typeof VERDICT]?.label ?? cycle.verdict}
                          </span>
                        )}
                        {cycle.model && (
                          <span className="ml-auto font-mono text-[11px] text-faint">
                            {cycle.model}
                          </span>
                        )}
                      </div>

                      {cycle.gateMissing.map((reason) => (
                        <p key={reason} className="mt-0.5 text-[12px] text-muted">
                          {reason}
                        </p>
                      ))}

                      {/* Falha tecnica nunca virou veredito: ela aparece como falha. */}
                      {cycle.lastError && (
                        <p className="mt-0.5 text-[12px] text-danger">{cycle.lastError}</p>
                      )}

                      {cycle.findings.length > 0 && (
                        <ul className="mt-2 flex flex-col gap-1.5">
                          {cycle.findings.map((finding) => (
                            <li
                              key={finding.id}
                              className="rounded-[var(--radius-control)] border border-line px-3 py-2"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <code className="rounded-[5px] bg-sunk px-1.5 py-0.5 font-mono text-[11.5px] text-muted">
                                  {finding.ruleCode}
                                </code>
                                {finding.isBlocking && (
                                  <span className="rounded-[5px] border border-danger/40 px-1.5 py-0.5 text-[11px] text-danger">
                                    inegociável
                                  </span>
                                )}
                                {finding.file && (
                                  <span className="text-[11.5px] text-faint">{finding.file}</span>
                                )}
                              </div>
                              <p className="mt-1 text-[13px] leading-relaxed text-ink">
                                {finding.detail}
                              </p>
                              {finding.excerpt && (
                                <p className="mt-0.5 text-[12px] text-muted">
                                  “{finding.excerpt}”
                                </p>
                              )}
                              <p className="mt-1 text-[11.5px] text-faint">{finding.ruleText}</p>
                            </li>
                          ))}
                        </ul>
                      )}

                      {cycle.status === "emitido" && cycle.findings.length === 0 && (
                        <p className="mt-1 text-[12.5px] text-success">
                          Nenhuma regra conferiúvel foi violada.
                        </p>
                      )}

                      {/*
                        Cobertura na tela, sempre. Quando o sistema entra no ar
                        todo mundo assume que ele cuida de tudo, e as regras que
                        continuaram humanas param de ser conferidas por qualquer
                        um: cada lado achando que o outro esta olhando.
                      */}
                      {cycle.applied.length > 0 && (
                        <p className="mt-1.5 text-[11.5px] text-faint">
                          Conferiu {cycle.applied.length} regra
                          {cycle.applied.length === 1 ? "" : "s"}: {cycle.applied.join(", ")}.
                        </p>
                      )}

                      {cycle.notVerified.length > 0 && (
                        <div className="mt-1 flex gap-2 text-[11.5px] text-warning">
                          <AlertTriangle size={13} className="mt-[2px] shrink-0" />
                          <span>
                            Não conseguiu conferir:{" "}
                            {cycle.notVerified.map((row) => `${row.code} (${row.reason})`).join("; ")}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3">
                <RequestReview workItemId={data.item.id} />
              </div>
            </Section>

            <p className="text-[12px] text-faint">
              O revisor está em <strong className="font-medium text-muted">modo silencioso</strong>:
              emite parecer e não move nada. Ver{" "}
              <Link href="/trabalho" className="text-accent hover:underline">
                a tarefa
              </Link>{" "}
              não muda nada aqui.
            </p>
          </>
        )}
      </div>
    </>
  );
}
