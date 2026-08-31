import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Check,
  FileText,
  Link2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { assertCanManage, requireUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { EmptyState, PageHeader } from "@/components/page-header";
import { diagnose } from "@/features/review/diagnose";
import type { GateCode } from "@/features/review/gate";
import { ItemPicker } from "@/features/review/item-picker";
import { ModeBadge } from "@/features/review/mode-badge";
import { pickerOptions } from "@/features/review/pick";
import { PromptPreview } from "@/features/review/prompt-preview";
import { RequestReview } from "@/features/review/request-review";
import { reviewMode } from "@/features/review/settings";

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

/**
 * Para onde vai quem quer resolver a pendência.
 *
 * Diagnóstico sem saída é meio diagnóstico: a pessoa lê "falta a copy", fecha a
 * tela e vai procurar a tarefa na lista. O botão não edita nada aqui — leva ao
 * lugar onde aquele campo mora, que é o detalhe da tarefa ou a tela de Regras.
 * Duplicar o editor da tarefa dentro do revisor criaria dois lugares para
 * mudar a mesma coisa.
 */
const SAIDA: Record<GateCode, { label: string; href: (itemId: string) => string } | null> = {
  sem_tipo: { label: "Definir tipo", href: (id) => `/trabalho?item=${id}` },
  sem_copy: { label: "Colar copy", href: (id) => `/trabalho?item=${id}` },
  copy_curta: { label: "Rever a copy", href: (id) => `/trabalho?item=${id}` },
  sem_regra: { label: "Escrever a regra", href: () => "/revisor/regras" },
  desligado: { label: "Ligar nesta empresa", href: () => "/revisor/regras" },
  sumiu: null,
};

function Card({
  title,
  hint,
  aside,
  tone = "neutro",
  children,
}: {
  title: string;
  hint?: string;
  aside?: React.ReactNode;
  tone?: "neutro" | "barra";
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] border p-4",
        tone === "barra" ? "border-danger/35 bg-danger-soft" : "border-line bg-surface",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={cn("label-mono", tone === "barra" && "text-danger")}>{title}</h2>
        {aside}
      </div>
      {hint ? <p className="mt-1.5 text-[12px] text-faint">{hint}</p> : null}
      <div className="mt-3.5">{children}</div>
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

  const [mode, options, data] = await Promise.all([
    reviewMode(user.orgId),
    pickerOptions(user),
    params.item ? diagnose(user, params.item) : Promise.resolve(null),
  ]);

  /**
   * Os oito campos de que o recorte é feito, e quantos deles existem. O contador
   * é o que permite recolher esta seção sem escondê-la: "3 de 8" já diz que vale
   * a pena abrir, e "8 de 8" já diz que não.
   */
  const campos: Array<[string, string | null]> = data
    ? [
        ["Tarefa", data.item.title],
        ["Empresa", data.item.companyName],
        ["Projeto", data.item.projectName],
        ["Etapa", data.item.stageName],
        ["Tipo", data.item.skill],
        ["Formato", data.item.format],
        ["Copy", data.item.copy?.trim() ? `${data.item.copy.trim().length} caracteres` : null],
        [
          "Arquivos",
          data.files.length
            ? `${data.files.filter((f) => f.kind === "file").length} arquivo(s), ${
                data.files.filter((f) => f.kind === "link").length
              } link(s)`
            : null,
        ],
      ]
    : [];

  const preenchidos = campos.filter(([, value]) => value).length;
  const faltando = campos.filter(([, value]) => !value).map(([label]) => label);

  return (
    <>
      <PageHeader
        title="Revisor"
        badge={<ModeBadge mode={mode} />}
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

      <div className="flex flex-col gap-4 px-5 py-5 md:px-7">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <ItemPicker
            options={options}
            current={
              data
                ? {
                    id: data.item.id,
                    title: data.item.title,
                    companyName: data.item.companyName,
                    projectName: data.item.projectName,
                  }
                : null
            }
          />

          <span className="text-[11.5px] text-faint">
            o diagnóstico atualiza sozinho — escolher já diagnostica
          </span>

          {data && (
            <Link
              href={`/trabalho?item=${data.item.id}`}
              className="ml-auto flex items-center gap-1 text-[11.5px] text-faint transition-colors hover:text-ink"
            >
              ver a tarefa
              <ArrowUpRight size={12} />
            </Link>
          )}
        </div>

        {!data ? (
          <EmptyState
            title={params.item ? "Entrega não encontrada" : "Nenhuma entrega apontada"}
            description={
              params.item
                ? "O link aponta para uma tarefa que não existe mais, ou que está numa empresa fora do seu alcance."
                : "Escolha uma entrega para ver o que o porteiro barraria, quais regras se aplicam e o que iria para o modelo."
            }
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr] xl:items-start">
            {/* -------------------------------------------- coluna da esquerda */}
            <div className="flex flex-col gap-4">
              {/*
                O porteiro (ou o veredito) vem primeiro. Na versão anterior a
                primeira dobra era "O que o sistema vê" — oito linhas de campo
                que ninguém abre a tela para ler. Quem abre quer saber se passa.
              */}
              {data.gate.ok ? (
                <Card
                  title="Porteiro · liberou"
                  hint="Roda antes de gastar IA. Barra entrada incompleta e diz o que falta."
                >
                  <p className="flex items-center gap-2 text-[13.5px] text-success">
                    <Check size={15} strokeWidth={2.5} className="shrink-0" />
                    Passa. {data.gate.ruleCount} regra{data.gate.ruleCount === 1 ? "" : "s"} de
                    máquina para “{data.gate.skill}”.
                  </p>

                  <div className="mt-4 border-t border-line pt-3.5">
                    <RequestReview workItemId={data.item.id} />
                  </div>
                </Card>
              ) : (
                <Card
                  title="Porteiro · barrou a entrada"
                  tone="barra"
                  hint="Roda antes de gastar IA. Barra entrada incompleta e diz o que falta."
                  aside={
                    <span className="text-[11.5px] text-muted">
                      <span className="tnum">{data.gate.pending.length}</span>{" "}
                      {data.gate.pending.length === 1 ? "pendência" : "pendências"}
                    </span>
                  }
                >
                  <ul className="flex flex-col gap-2.5">
                    {data.gate.pending.map((reason) => {
                      const saida = SAIDA[reason.code];
                      return (
                        <li
                          key={reason.code}
                          className="flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 py-3"
                        >
                          <X size={15} className="shrink-0 text-danger" />
                          <span className="min-w-[12rem] flex-1 text-[13px] text-ink">
                            {reason.text}
                          </span>
                          {saida && (
                            <Link
                              href={saida.href(data.item.id)}
                              className="shrink-0 rounded-[var(--radius-control)] bg-brand px-3 py-1.5 text-[12px] font-medium text-brand-fg transition-[filter] hover:brightness-[1.07]"
                            >
                              {saida.label}
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  <div className="mt-4 border-t border-line pt-3.5">
                    <RequestReview
                      workItemId={data.item.id}
                      blocked={
                        data.gate.pending.length === 1
                          ? "Bloqueado enquanto o porteiro tiver pendência. Resolva a de cima e o botão libera."
                          : `Bloqueado enquanto o porteiro tiver pendência. Resolva as ${data.gate.pending.length} acima e o botão libera.`
                      }
                    />
                  </div>
                </Card>
              )}

              {/*
                Recolhido por padrão, e recolhido em <details>: sem estado no
                cliente, sem JavaScript, e o navegador guarda o comportamento de
                sempre. O contador no cabeçalho é o que faz o recolhimento ser
                honesto.
              */}
              <details className="group rounded-[var(--radius-card)] border border-line bg-surface">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="text-[11px] text-faint transition-transform group-open:rotate-90"
                    >
                      ▸
                    </span>
                    <span className="label-mono">O que o sistema vê</span>
                  </span>
                  <span
                    className={cn(
                      "tnum font-mono text-[11px]",
                      faltando.length ? "text-warning" : "text-faint",
                    )}
                  >
                    {preenchidos} de {campos.length} campos preenchidos
                  </span>
                </summary>

                <div className="border-t border-line px-4 py-3.5">
                  <p className="text-[12px] text-faint">
                    É daqui que sai o recorte das regras.
                    {faltando.length > 0 && <> Faltando: {faltando.join(", ")}.</>}
                  </p>

                  <div className="mt-3 flex flex-col">
                    {campos.map(([label, value]) => (
                      <Fact key={label} label={label} value={value} />
                    ))}
                  </div>

                  {data.files.length > 0 && (
                    <div className="mt-2.5 flex flex-col gap-0.5">
                      {data.files.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center gap-2 text-[12.5px] text-muted"
                        >
                          {file.kind === "link" ? <Link2 size={12} /> : <FileText size={12} />}
                          <span className="truncate">{file.filename}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </details>

              <Card
                title="O pedido que iria para o modelo"
                hint="Montado pela mesma função que o julgamento usa, sem gastar chamada."
              >
                {"error" in data.prompt ? (
                  <p className="rounded-[var(--radius-control)] border border-dashed border-line px-3.5 py-3 font-mono text-[12px] text-faint">
                    {data.prompt.error}
                  </p>
                ) : (
                  <PromptPreview system={data.prompt.system} briefing={data.prompt.briefing} />
                )}
              </Card>

              <Card
                title="Revisões desta entrega"
                aside={<span className="text-[11.5px] text-faint">Cada rodada é uma linha nova.</span>}
              >
                {data.cycles.length === 0 ? (
                  <p className="text-[13px] text-faint">Nenhuma revisão pedida ainda.</p>
                ) : (
                  <div className="flex flex-col">
                    {data.cycles.map((cycle) => (
                      <div key={cycle.id} className="border-b border-line py-2.5 first:pt-0 last:border-b-0">
                        <div className="flex flex-wrap items-center gap-2 text-[13px]">
                          <span className="tnum text-faint">rodada {cycle.round}</span>
                          <span className="text-ink">
                            {STATUS_LABEL[cycle.status] ?? cycle.status}
                          </span>
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
                              ·{" "}
                              {VERDICT[cycle.verdict as keyof typeof VERDICT]?.label ??
                                cycle.verdict}
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

                        {/*
                          Falha tecnica nunca virou veredito: ela aparece em
                          ambar de aviso, no bloco proprio, e nunca no vermelho
                          de reprovacao. Ler "falhou" em vermelho ensina o time
                          a achar que o robo reprovou.
                        */}
                        {cycle.lastError && (
                          <div className="mt-2 rounded-[var(--radius-control)] border border-warning/35 bg-warning-soft px-3 py-2.5">
                            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-warning">
                              Falhou
                            </span>
                            <p className="mt-1.5 text-[12px] text-ink">
                              A rodada não produziu parecer. Nada foi julgado, nada mudou na tarefa.
                            </p>
                            <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-muted">
                              {cycle.lastError}
                            </p>
                          </div>
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
                                  <p className="mt-1.5 border-l-2 border-danger/50 bg-danger-soft px-2.5 py-1.5 text-[12.5px] leading-relaxed text-ink">
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
                            Nenhuma regra conferível foi violada.
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
                              {cycle.notVerified
                                .map((row) => `${row.code} (${row.reason})`)
                                .join("; ")}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* --------------------------------------------- coluna da direita */}
            <div className="flex flex-col gap-4">
              <Card
                title="Regras que se aplicam"
                hint="As camadas se somam: o que vale para todos, para a empresa e para o tipo de peça."
                aside={<span className="tnum font-mono text-[11px] text-faint">{data.rules.length}</span>}
              >
                {data.rules.length === 0 ? (
                  <p className="flex gap-2 text-[13px] text-muted">
                    <AlertTriangle size={15} className="mt-[2px] shrink-0 text-warning" />
                    <span>
                      Nenhuma regra cadastrada para este recorte. Enquanto não houver, o revisor não
                      emite parecer — e é assim que tem que ser: preencher o buraco com boa prática
                      de mercado seria pior que deixá-lo visível.
                    </span>
                  </p>
                ) : (
                  <div className="flex flex-col gap-3.5">
                    {data.rules.map((rule) => (
                      <div key={rule.id} className="border-b border-line pb-3.5 last:border-b-0 last:pb-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="font-mono text-[11.5px] font-medium text-ink">
                            {rule.code}
                          </code>
                          <span
                            className={cn(
                              "rounded-[4px] border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]",
                              rule.verifier === "maquina"
                                ? "border-accent/35 text-accent"
                                : "border-line text-faint",
                            )}
                          >
                            {VERIFIER_LABEL[rule.verifier]}
                          </span>
                          {rule.isBlocking && (
                            <span className="rounded-[4px] border border-danger/35 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-danger">
                              inegociável
                            </span>
                          )}
                          <span className="ml-auto text-[11.5px] text-faint">{rule.scopeLabel}</span>
                        </div>
                        <p className="mt-2 text-[13px] leading-relaxed text-ink">{rule.text}</p>
                        {rule.rationale && (
                          <p className="mt-1 text-[12px] leading-relaxed text-faint">
                            {rule.rationale}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <p className="mt-4 border-t border-line pt-3.5 text-[11px] leading-relaxed text-faint">
                  Regra é dado, não código. Se não está em{" "}
                  <Link href="/revisor/regras" className="text-accent hover:underline">
                    Regras
                  </Link>
                  , não é conferido.
                </p>
              </Card>

              {data.overlaps.length > 0 && (
                <Card
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
                </Card>
              )}

              <Card
                title="Checklist da pessoa"
                hint="Cobre o que a máquina não pega. Item repetido vira marcação automática em duas semanas."
              >
                {data.checklist.length === 0 ? (
                  <p className="text-[13px] text-faint">Nenhum item cadastrado para este recorte.</p>
                ) : (
                  <ul className="flex flex-col gap-2.5">
                    {data.checklist.map((item) => (
                      <li key={item.id} className="flex gap-2.5 text-[13px] text-ink">
                        <span
                          aria-hidden
                          className="mt-[3px] h-[15px] w-[15px] shrink-0 rounded-[4px] border border-line-strong"
                        />
                        <span>
                          {item.text}
                          {item.isReliabilityProbe && (
                            <span className="ml-1.5 font-mono text-[11px] text-faint">
                              (medidor de confiabilidade)
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
