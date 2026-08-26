import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { assertCanManage, requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { loadMetrics, metricCompanies } from "@/features/review/metrics";

export const metadata: Metadata = { title: "Medição do revisor · MKT Hub" };
export const dynamic = "force-dynamic";

const PERIODS = [7, 30, 90];

function Card({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-3">
      <p className="label-mono">{label}</p>
      <p className="tnum mt-1 text-[22px] leading-none text-ink">{value}</p>
      {hint ? <p className="mt-1 text-[11.5px] text-faint">{hint}</p> : null}
    </div>
  );
}

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
      <h2 className="label-mono">{title}</h2>
      {hint ? <p className="mb-2.5 mt-1 text-[12px] text-faint">{hint}</p> : <div className="mb-2.5" />}
      {children}
    </section>
  );
}

export default async function MedicaoPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string; empresa?: string }>;
}) {
  const user = await requireUser();
  assertCanManage(user);

  const params = await searchParams;
  const days = PERIODS.includes(Number(params.dias)) ? Number(params.dias) : 30;
  const companyId =
    params.empresa && user.companyIds.includes(params.empresa) ? params.empresa : null;

  const [data, companies] = await Promise.all([
    loadMetrics(user, { days, companyId }),
    metricCompanies(user),
  ]);

  const link = (next: { dias?: number; empresa?: string | null }) => {
    const search = new URLSearchParams();
    search.set("dias", String(next.dias ?? days));
    const company = next.empresa === undefined ? companyId : next.empresa;
    if (company) search.set("empresa", company);
    return `/revisor/medicao?${search.toString()}`;
  };

  const judged = data.totals.aprovado + data.totals.ajustar + data.totals.reprovado;
  const reversalRate =
    data.reversal.decided > 0
      ? `${Math.round((data.reversal.overturned / data.reversal.decided) * 100)}%`
      : "—";

  return (
    <>
      <PageHeader
        title="Medição do revisor"
        description="A taxa de reversão é o número que decide se a ferramenta fica."
        actions={
          <Link
            href="/revisor"
            className="flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft size={14} />
            Diagnóstico
          </Link>
        }
      />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((period) => (
            <Link
              key={period}
              href={link({ dias: period })}
              className={
                period === days
                  ? "rounded-[var(--radius-control)] border border-accent/40 bg-accent-soft px-2.5 py-1 text-[12.5px] text-accent"
                  : "rounded-[var(--radius-control)] border border-line px-2.5 py-1 text-[12.5px] text-muted transition-colors hover:text-ink"
              }
            >
              {period} dias
            </Link>
          ))}

          <span className="mx-1 h-4 w-px bg-line" aria-hidden />

          <Link
            href={link({ empresa: null })}
            className={
              companyId === null
                ? "rounded-[var(--radius-control)] border border-accent/40 bg-accent-soft px-2.5 py-1 text-[12.5px] text-accent"
                : "rounded-[var(--radius-control)] border border-line px-2.5 py-1 text-[12.5px] text-muted transition-colors hover:text-ink"
            }
          >
            Todas
          </Link>
          {companies.map((company) => (
            <Link
              key={company.id}
              href={link({ empresa: company.id })}
              className={
                companyId === company.id
                  ? "rounded-[var(--radius-control)] border border-accent/40 bg-accent-soft px-2.5 py-1 text-[12.5px] text-accent"
                  : "rounded-[var(--radius-control)] border border-line px-2.5 py-1 text-[12.5px] text-muted transition-colors hover:text-ink"
              }
            >
              {company.name}
            </Link>
          ))}
        </div>

        {data.totals.cycles === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-10 text-center text-[13px] text-faint">
            Nenhuma revisão neste período.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card
                label="Taxa de reversão"
                value={reversalRate}
                hint={
                  data.reversal.decided > 0
                    ? `${data.reversal.overturned} de ${data.reversal.decided} pareceres que pediam trabalho foram derrubados`
                    : "Ninguém decidiu ainda sobre um parecer que pedia trabalho"
                }
              />
              <Card
                label="Pareceres"
                value={String(judged)}
                hint={`${data.totals.aprovado} sem violação · ${data.totals.ajustar} ajustar · ${data.totals.reprovado} reprovados`}
              />
              <Card
                label="Tokens"
                value={`${(data.cost.tokensIn / 1000).toFixed(1)}k / ${(data.cost.tokensOut / 1000).toFixed(1)}k`}
                hint={`entrada / saída em ${data.cost.runs} execuç${data.cost.runs === 1 ? "ão" : "ões"}${
                  data.cost.avgSeconds !== null ? ` · ${data.cost.avgSeconds}s em média` : ""
                }`}
              />
              <Card
                label="Não julgados"
                value={String(data.totals.incompleto + data.totals.falhou)}
                hint={`${data.totals.incompleto} barrados pelo porteiro · ${data.totals.falhou} falharam`}
              />
            </div>

            {data.totals.escalated > 0 || data.totals.reused > 0 ? (
              <p className="text-[12.5px] text-faint">
                {data.totals.escalated > 0
                  ? `${data.totals.escalated} entrega(s) chegaram à terceira reprovação e foram para decisão humana. `
                  : ""}
                {data.totals.reused > 0
                  ? `${data.totals.reused} parecer(es) se repetiram sem nova chamada, porque a entrada não mudou.`
                  : ""}
              </p>
            ) : null}

            <Section
              title="Regras que mais reprovam"
              hint="Regra que reprova quase tudo costuma estar mal escrita — não é o time que está errado."
            >
              {data.topRules.length === 0 ? (
                <p className="text-[13px] text-faint">Nenhum achado no período.</p>
              ) : (
                <div className="flex flex-col">
                  {data.topRules.map((rule) => (
                    <div
                      key={rule.code}
                      className="flex flex-wrap items-baseline gap-2 border-b border-line py-2 last:border-b-0"
                    >
                      <code className="rounded-[5px] bg-sunk px-1.5 py-0.5 font-mono text-[11.5px] text-muted">
                        {rule.code}
                      </code>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                        {rule.text}
                      </span>
                      <span className="tnum text-[12.5px] text-ink">{rule.findings}</span>
                      <span className="text-[11.5px] text-faint">
                        em {rule.items} entrega{rule.items === 1 ? "" : "s"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {data.probes.length > 0 && (
              <Section
                title="Medidores do checklist"
                hint="Itens que a pessoa marca e a máquina também confere. Divergência diz algo sobre o processo, não sobre o texto."
              >
                <div className="flex flex-col">
                  {data.probes.map((probe) => (
                    <div
                      key={probe.text}
                      className="flex flex-wrap items-baseline gap-2 border-b border-line py-2 last:border-b-0"
                    >
                      <span className="min-w-0 flex-1 text-[13px] text-ink">{probe.text}</span>
                      <span className="tnum text-[12.5px] text-ink">
                        {probe.withFindings}/{probe.checked}
                      </span>
                      <span className="text-[11.5px] text-faint">
                        marcados com achado do robô na mesma entrega
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {data.failures.length > 0 && (
              <Section title="Execuções falhadas" hint="Falha técnica nunca virou veredito.">
                <div className="flex flex-col">
                  {data.failures.map((failure) => (
                    <div
                      key={failure.error}
                      className="flex items-baseline gap-2 border-b border-line py-2 last:border-b-0"
                    >
                      <span className="tnum text-[12.5px] text-danger">{failure.count}×</span>
                      <span className="min-w-0 flex-1 text-[12.5px] text-muted">
                        {failure.error || "sem mensagem"}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <p className="text-[11.5px] text-faint">
              A concordância é inferida do que a pessoa fez com a entrega depois do parecer:
              mandou adiante mesmo com parecer pedindo trabalho conta como discordância; mandou
              refazer conta como concordância. Ninguém responde questionário sobre parecer de
              robô.
            </p>
          </>
        )}
      </div>
    </>
  );
}
