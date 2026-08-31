import { cn } from "@/lib/utils";
import { ProgressRing } from "@/components/progress-ring";
import { faixaDe, porEmpresa, porPessoa, type Fatia, type Ocorrencia, type Resumo } from "./stats";
import { BARRA, TOM } from "./tone";

/**
 * O painel de aderencia: quanto do que venceu saiu, por empresa e por pessoa.
 *
 * Fica **acima** da grade e nao dentro dela. A grade responde "o que fazer
 * agora"; o painel responde "como estamos indo". Sao perguntas diferentes, e
 * enfiar a segunda dentro da primeira transforma a tela de marcar publicado
 * numa tela de relatorio que ninguem responde de pe.
 */

function Percentual({ resumo, className }: { resumo: Resumo; className?: string }) {
  return (
    <span className={cn("tnum font-medium", TOM[faixaDe(resumo.pct)], className)}>
      {resumo.pct === null ? "—" : `${resumo.pct}%`}
    </span>
  );
}

function Linha({ fatia }: { fatia: Fatia }) {
  const { resumo } = fatia;

  return (
    <li className="flex items-center gap-3 py-1.5">
      {fatia.cor ? (
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: fatia.cor }}
        />
      ) : null}

      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{fatia.nome}</span>

      {resumo.atrasadas > 0 && (
        <span className="tnum shrink-0 text-[11.5px] text-danger">
          {resumo.atrasadas} atrasada{resumo.atrasadas > 1 ? "s" : ""}
        </span>
      )}

      <span className="tnum shrink-0 text-[11.5px] text-faint">
        {resumo.feitas}/{resumo.cobradas}
      </span>

      {/*
        A barra e leitura rapida, nao o dado. Por isso o numero fica do lado e
        nao dentro dela: barra sem numero obriga a estimar, e a estimativa de
        quem esta com pressa sempre erra para o lado otimista.
      */}
      <span className="hidden h-1 w-20 shrink-0 overflow-hidden rounded-full bg-surface-sunk sm:block">
        <span
          className={cn("block h-full rounded-full", BARRA[faixaDe(resumo.pct)])}
          style={{ width: `${resumo.pct ?? 0}%` }}
        />
      </span>

      <Percentual resumo={resumo} className="w-10 shrink-0 text-right text-[13px]" />
    </li>
  );
}

function Bloco({ titulo, fatias }: { titulo: string; fatias: Fatia[] }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <h2 className="label-mono">{titulo}</h2>
      <ul className="mt-1.5 divide-y divide-line">
        {fatias.map((fatia) => (
          <Linha key={fatia.id} fatia={fatia} />
        ))}
      </ul>
    </section>
  );
}

export function RoutineSummary({
  ocorrencias,
  hoje,
  geral,
}: {
  ocorrencias: Ocorrencia[];
  hoje: string;
  geral: Resumo;
}) {
  const empresas = porEmpresa(ocorrencias, hoje);
  const pessoas = porPessoa(ocorrencias, hoje);

  return (
    <div className="mb-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {/*
          O mesmo anel de Desempenho. Aqui ele substitui o numero grande e nao
          se soma a ele: dois lugares dizendo 33% na mesma linha e repeticao, e
          o anel diz a mesma coisa mostrando tambem o que falta para fechar.

          `bg-bg` no miolo porque este bloco fica solto na pagina, fora de
          cartao — com `bg-surface` sobraria um disco claro no meio do anel.
        */}
        <p className="flex items-center gap-3">
          <span className={TOM[faixaDe(geral.pct)]}>
            <ProgressRing percentual={geral.pct} tom={TOM[faixaDe(geral.pct)]} miolo="bg-bg" />
          </span>
          <span className="text-[13px] text-muted">
            do que venceu nesta semana{" "}
            <span className="tnum text-faint">
              ({geral.feitas}/{geral.cobradas})
            </span>
          </span>
        </p>

        {geral.atrasadas > 0 && (
          <span className="tnum text-[13px] font-medium text-danger">
            {geral.atrasadas} atrasada{geral.atrasadas > 1 ? "s" : ""}
          </span>
        )}

        {geral.previstas > 0 && (
          <span className="tnum text-[13px] text-muted">
            {geral.previstas} ainda por sair
          </span>
        )}
      </div>

      {/*
        Hoje nao entra na conta ate o dia virar — senao a segunda de manha
        marcaria a semana inteira como zero por cento, com nada atrasado.
      */}
      <p className="text-[11.5px] text-faint">
        A porcentagem conta só o que já venceu. O dia de hoje entra quando virar.
      </p>

      <div className="grid gap-3 lg:grid-cols-2">
        <Bloco titulo="Por empresa" fatias={empresas} />
        <Bloco titulo="Por colaborador" fatias={pessoas} />
      </div>
    </div>
  );
}
