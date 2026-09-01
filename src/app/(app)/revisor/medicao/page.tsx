import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { assertCanManage, requireUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { loadMetrics, metricCompanies } from "@/features/review/metrics";
import { loadExcecoes } from "@/features/review/excecoes";
import { TETO_SUGERIDO } from "@/lib/excecao";
import { ModeBadge } from "@/features/review/mode-badge";
import { reviewMode } from "@/features/review/settings";

export const metadata: Metadata = { title: "Medição do revisor · MKT Hub" };
export const dynamic = "force-dynamic";

const PERIODS = [7, 30, 90];

/**
 * De quantas decisões humanas a taxa de reversão começa a dizer alguma coisa.
 *
 * Abaixo disso o percentual é ruído com cara de número: uma única discordância
 * em duas decisões vira "50% de reversão", alguém leva isso para uma reunião e
 * a ferramenta é julgada por uma amostra de dois. Escrever "amostra
 * insuficiente" custa a mesma linha e não mente.
 */
const MIN_AMOSTRA = 10;

/** Retângulo de filtro: arredondado. Em Regras, escopo é retângulo reto. */
function Pill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full px-3 py-1 text-[12.5px] transition-colors",
        active
          ? "border border-brand-line bg-brand-soft font-medium text-ink"
          : "border border-transparent text-muted hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}

function Card({
  label,
  children,
  hint,
  dashed,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  /** Tracejado quando o cartão não tem número para dar. */
  dashed?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border p-4",
        dashed ? "border-dashed border-line-strong bg-sunk" : "border-line bg-surface",
      )}
    >
      <p className="label-mono">{label}</p>
      <div className="mt-3">{children}</div>
      {hint ? <p className="mt-2 text-[11.5px] leading-relaxed text-faint">{hint}</p> : null}
    </div>
  );
}

function Section({
  title,
  hint,
  aside,
  tone = "neutro",
  children,
}: {
  title: string;
  hint?: string;
  aside?: React.ReactNode;
  tone?: "neutro" | "aviso";
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] border p-4",
        tone === "aviso" ? "border-warning/35 bg-warning-soft" : "border-line bg-surface",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={cn("label-mono", tone === "aviso" && "text-warning")}>{title}</h2>
        {aside}
      </div>
      {hint ? <p className="mt-1.5 text-[12px] text-faint">{hint}</p> : null}
      <div className="mt-3.5">{children}</div>
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

  const [data, companies, mode, excecoes] = await Promise.all([
    loadMetrics(user, { days, companyId }),
    metricCompanies(user),
    reviewMode(user.orgId),
    loadExcecoes(user, { days, companyId }),
  ]);

  /*
   * Arredondar para baixo aqui seria confortável e errado: 19,7% viraria 19% e
   * passaria por baixo do teto que a diretoria definiu. Arredondamento normal.
   */
  const usoDaExcecao =
    excecoes.base > 0 ? Math.round((excecoes.marcadas / excecoes.base) * 100) : 0;
  const acimaDoTeto = usoDaExcecao > TETO_SUGERIDO;

  const link = (next: { dias?: number; empresa?: string | null }) => {
    const search = new URLSearchParams();
    search.set("dias", String(next.dias ?? days));
    const company = next.empresa === undefined ? companyId : next.empresa;
    if (company) search.set("empresa", company);
    return `/revisor/medicao?${search.toString()}`;
  };

  const judged = data.totals.aprovado + data.totals.ajustar + data.totals.reprovado;
  const amostra = data.reversal.decided;
  const bastante = amostra >= MIN_AMOSTRA;

  return (
    <>
      <PageHeader
        title="Medição do revisor"
        badge={<ModeBadge mode={mode} />}
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

      <div className="flex flex-col gap-4 px-5 py-5 md:px-7">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex gap-1 rounded-full bg-sunk p-1">
            {PERIODS.map((period) => (
              <Pill key={period} href={link({ dias: period })} active={period === days}>
                {period} dias
              </Pill>
            ))}
          </div>

          <span className="h-4 w-px bg-line" aria-hidden />

          <div className="flex flex-wrap gap-1.5">
            <Pill href={link({ empresa: null })} active={companyId === null}>
              Todas as empresas
            </Pill>
            {companies.map((company) => (
              <Pill
                key={company.id}
                href={link({ empresa: company.id })}
                active={companyId === company.id}
              >
                {company.name}
              </Pill>
            ))}
          </div>
        </div>

        {data.totals.cycles === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-10 text-center text-[13px] text-faint">
            Nenhuma revisão neste período.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Card
                label="Taxa de reversão"
                dashed={!bastante}
                hint={
                  bastante ? (
                    <>
                      <span className="tnum">{data.reversal.overturned}</span> de{" "}
                      <span className="tnum">{amostra}</span> pareceres que pediam trabalho foram
                      derrubados por uma pessoa
                    </>
                  ) : (
                    <>
                      <span className="tnum">{amostra}</span>{" "}
                      {amostra === 1 ? "parecer decidido" : "pareceres decididos"} até aqui. O número
                      começa a valer a partir de <span className="tnum">{MIN_AMOSTRA}</span>.
                    </>
                  )
                }
              >
                {bastante ? (
                  <p className="tnum font-display text-[26px] leading-none text-ink">
                    {Math.round((data.reversal.overturned / amostra) * 100)}%
                  </p>
                ) : (
                  <p className="text-[15px] leading-tight text-warning">Amostra insuficiente</p>
                )}
              </Card>

              <Card
                label="Pareceres"
                hint={
                  <>
                    <span className="tnum">{data.totals.aprovado}</span> sem violação ·{" "}
                    <span className="tnum">{data.totals.ajustar}</span> ajustar ·{" "}
                    <span className="tnum text-muted">{data.totals.reprovado}</span> reprovado
                    {data.totals.reprovado === 1 ? "" : "s"}
                  </>
                }
              >
                <p className="tnum font-display text-[26px] leading-none text-ink">{judged}</p>
              </Card>

              <Card
                label="Tokens"
                hint={
                  <>
                    entrada / saída em <span className="tnum">{data.cost.runs}</span> execuç
                    {data.cost.runs === 1 ? "ão" : "ões"}
                    {data.cost.avgSeconds !== null && (
                      <>
                        {" · "}
                        <span className="tnum">{data.cost.avgSeconds}</span>s em média
                      </>
                    )}
                  </>
                }
              >
                <p className="tnum font-display text-[26px] leading-none text-ink">
                  {(data.cost.tokensIn / 1000).toFixed(1)}k{" "}
                  <span className="text-[16px] text-faint">
                    / {(data.cost.tokensOut / 1000).toFixed(1)}k
                  </span>
                </p>
              </Card>

              <Card
                label="Não julgados"
                hint={
                  <>
                    <span className="tnum">{data.totals.incompleto}</span> barrado
                    {data.totals.incompleto === 1 ? "" : "s"} pelo porteiro ·{" "}
                    <span className={cn("tnum", data.totals.falhou > 0 && "text-warning")}>
                      {data.totals.falhou}
                    </span>{" "}
                    {data.totals.falhou === 1 ? "falhou" : "falharam"}
                  </>
                }
              >
                <p className="tnum font-display text-[26px] leading-none text-ink">
                  {data.totals.incompleto + data.totals.falhou}
                </p>
              </Card>
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
                      className="flex flex-wrap items-baseline gap-3 border-b border-line py-2.5 first:pt-0 last:border-b-0"
                    >
                      <code className="w-[3rem] shrink-0 font-mono text-[11.5px] font-medium text-ink">
                        {rule.code}
                      </code>
                      <span className="min-w-[14rem] flex-1 text-[13px] leading-relaxed text-ink">
                        {rule.text}
                      </span>
                      <span className="tnum shrink-0 whitespace-nowrap font-mono text-[11px] text-muted">
                        {rule.findings} em {rule.items} entrega{rule.items === 1 ? "" : "s"}
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
                      className="flex flex-wrap items-baseline gap-3 border-b border-line py-2.5 first:pt-0 last:border-b-0"
                    >
                      <span className="min-w-[14rem] flex-1 text-[13px] text-ink">{probe.text}</span>
                      <span className="tnum shrink-0 font-mono text-[11px] text-muted">
                        {probe.withFindings}/{probe.checked} marcados com achado do robô na mesma
                        entrega
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {data.failures.length > 0 && (
              <Section
                title="Execuções falhadas"
                tone="aviso"
                aside={
                  <span className="text-[11.5px] text-muted">
                    Falha técnica nunca virou veredito.
                  </span>
                }
              >
                <div className="flex flex-col gap-3">
                  {data.failures.map((failure) => (
                    <div key={failure.error} className="flex items-start gap-3">
                      <span className="tnum shrink-0 rounded-[5px] border border-warning/40 px-2 py-1 font-mono text-[11px] text-warning">
                        {failure.count}×
                      </span>
                      <p className="min-w-0 flex-1 break-words rounded-[var(--radius-control)] border border-line bg-sunk px-3 py-2.5 font-mono text-[11px] leading-relaxed text-muted">
                        {failure.error || "sem mensagem"}
                      </p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <p className="max-w-[86ch] text-[11.5px] leading-relaxed text-faint">
              Como a concordância é inferida: mandou a peça adiante com um parecer que pedia
              trabalho conta como discordância; mandou refazer conta como concordância. Ninguém
              responde questionário sobre parecer de robô.
            </p>
          </>
        )}

        {/*
          O termômetro da exceção declarada.
          Fica fora do bloco acima de propósito: ele mede quem NÃO passou pela
          revisão, e some justamente no mês em que ninguém revisou nada — que é
          o mês em que mais interessa olhar.
        */}
        <Section
          title="Exceção declarada"
          tone={acimaDoTeto ? "aviso" : "neutro"}
          hint={
            'Peças marcadas como "não precisa de revisão automática". Se a porcentagem sobe, ' +
            "ou o time achou um atalho, ou a esteira está pedindo revisão de coisa que não precisa."
          }
          aside={
            <span className="text-[11.5px] text-muted">
              teto sugerido: <span className="tnum">{TETO_SUGERIDO}%</span>
            </span>
          }
        >
          {excecoes.base === 0 ? (
            <p className="text-[13px] text-faint">Nenhuma tarefa aberta neste período.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p
                  className={cn(
                    "tnum font-display text-[26px] leading-none",
                    acimaDoTeto ? "text-warning" : "text-ink",
                  )}
                >
                  {usoDaExcecao}%
                </p>
                <p className="text-[12.5px] text-muted">
                  <span className="tnum">{excecoes.marcadas}</span> de{" "}
                  <span className="tnum">{excecoes.base}</span> tarefas abertas no período
                  {excecoes.aprovacaoDeExcecao > 0 ? (
                    <>
                      {" · "}
                      <span className="tnum">{excecoes.aprovacaoDeExcecao}</span> marcada
                      {excecoes.aprovacaoDeExcecao === 1 ? "" : "s"} pela liderança depois de a
                      esteira ter começado
                    </>
                  ) : null}
                  {excecoes.recusados > 0 ? (
                    <>
                      {" · "}
                      <span className="tnum">{excecoes.recusados}</span> pedido
                      {excecoes.recusados === 1 ? "" : "s"} recusado
                      {excecoes.recusados === 1 ? "" : "s"}
                    </>
                  ) : null}
                </p>
              </div>

              {/*
                O backlog não é do período: são os pedidos que estão parados
                agora. Um pedido que ninguém decide é um pedido negado devagar,
                e devagar é pior — quem pediu fica esperando sem saber.
              */}
              {excecoes.abertos > 0 ? (
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[var(--radius-control)] border border-brand-line bg-brand-soft px-3 py-2">
                  <p className="tnum font-display text-[18px] leading-none text-ink">
                    {excecoes.abertos}
                  </p>
                  <p className="text-[12.5px] text-muted">
                    {excecoes.abertos === 1 ? "pedido esperando" : "pedidos esperando"} decisão.
                    Aparecem no quadro, no cartão da tarefa.
                  </p>
                </div>
              ) : null}

              {excecoes.marcadas > 0 ? (
                <div className="grid gap-4 @container sm:grid-cols-3">
                  <Quebra titulo="Por motivo" linhas={excecoes.porMotivo.map((l) => ({ nome: l.motivo, n: l.n }))} />
                  <Quebra titulo="Por pessoa" linhas={excecoes.porPessoa} />
                  <Quebra titulo="Por marca" linhas={excecoes.porEmpresa} />
                </div>
              ) : null}

              {excecoes.outros.length > 0 ? (
                <div>
                  <p className="label-mono">Motivo “Outro”, por extenso</p>
                  <p className="mb-2 mt-1 text-[11.5px] leading-relaxed text-faint">
                    Se este for o motivo mais usado, falta um item na lista fechada — e é a lista
                    que precisa mudar.
                  </p>
                  <div className="flex flex-col">
                    {excecoes.outros.map((linha) => (
                      <div key={linha.id} className="border-b border-line py-2.5 last:border-b-0">
                        <p className="text-[13px] text-ink">{linha.titulo}</p>
                        <p className="mt-0.5 text-[11.5px] text-faint">
                          {linha.empresa}
                          {linha.pessoa ? ` · ${linha.pessoa}` : ""}
                        </p>
                        {linha.justificativa ? (
                          <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-muted">
                            {linha.justificativa}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <p className="max-w-[86ch] text-[11.5px] leading-relaxed text-faint">
                As três saídas são medidas separadas e não se somam: marca fora do piloto é decisão
                do sistema, exceção declarada é de quem produz antes da esteira, e aprovação de
                exceção é da liderança depois dela. Juntar as três apagaria a diferença entre
                “falta manual”, “virou atalho” e “a esteira está atrapalhando”.
              </p>
            </div>
          )}
        </Section>
      </div>
    </>
  );
}

/** Uma quebra do termômetro. Tabela pequena resolve; gráfico só atrasaria. */
function Quebra({ titulo, linhas }: { titulo: string; linhas: Array<{ nome: string; n: number }> }) {
  return (
    <div>
      <p className="label-mono">{titulo}</p>
      <div className="mt-2 flex flex-col">
        {linhas.map((linha) => (
          <div
            key={linha.nome}
            className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-b-0"
          >
            <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink">{linha.nome}</span>
            <span className="tnum shrink-0 font-mono text-[11px] text-muted">{linha.n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
