/**
 * Baixa o board do ClickUp para `.cu-limpo.json`.
 *
 *   npm run clickup:baixar
 *
 * Existe porque o formato desse arquivo era conhecimento de quem rodou o
 * import da primeira vez, e mais ninguem. Import e sincronizacao dependiam de
 * um JSON que nao tinha como ser gerado de novo sem adivinhar o formato.
 *
 * **Passa pela ponte do `mkt-turbo`, e nao pela API direto.** O token do
 * ClickUp vive na Vercel, nao aqui — quem roda este script nao precisa de
 * credencial nenhuma, e nao existe uma segunda copia do token para vazar.
 *
 * O que ele resolve, e por que aqui e nao no import: `Empresa Tag` e um campo
 * de multipla escolha cujo valor sao ids, com os rotulos em `type_config`.
 * Quem ler o arquivo depois nao teria como saber o que `8f3a...` significa.
 */
import fs from "node:fs";

const PONTE = process.env.CLICKUP_PONTE ?? "https://mkt-turbo.vercel.app/api/clickup";
const SAIDA = process.env.CLICKUP_JSON ?? "./.cu-limpo.json";

/** O ClickUp pagina de cem em cem. O teto e trava contra laco infinito. */
const MAX_PAGINAS = 60;

type CampoBruto = {
  name: string;
  value?: unknown;
  type_config?: { options?: Array<{ id: string; label?: string; name?: string }> };
};

type TarefaBruta = {
  id: string;
  name: string;
  status?: { status?: string };
  assignees?: Array<{ username?: string }>;
  due_date?: string | null;
  date_closed?: string | null;
  date_updated?: string | null;
  priority?: { priority?: string } | null;
  custom_fields?: CampoBruto[];
};

const campo = (t: TarefaBruta, nome: string) => (t.custom_fields ?? []).find((c) => c.name === nome);

function empresaDe(t: TarefaBruta): string[] | null {
  const c = campo(t, "Empresa Tag");
  if (!c || !Array.isArray(c.value) || c.value.length === 0) return null;
  const opcoes = c.type_config?.options ?? [];
  const nomes = c.value
    .map((v) => opcoes.find((o) => o.id === v)?.label ?? opcoes.find((o) => o.id === v)?.name)
    .filter((n): n is string => Boolean(n));
  return nomes.length ? nomes : null;
}

function pontoDe(t: TarefaBruta): number | null {
  const v = campo(t, "Ponto de atividade MKT")?.value;
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const todas: TarefaBruta[] = [];

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const resposta = await fetch(`${PONTE}?recurso=task&include_closed=true&page=${pagina}`);
    if (!resposta.ok) {
      throw new Error(`A ponte respondeu ${resposta.status}: ${await resposta.text()}`);
    }
    const { tasks } = (await resposta.json()) as { tasks?: TarefaBruta[] };
    if (!tasks?.length) break;
    todas.push(...tasks);
  }

  const limpo = todas.map((t) => ({
    id: t.id,
    nome: t.name,
    status: (t.status?.status ?? "").trim(),
    resp: (t.assignees ?? []).map((a) => a.username).filter(Boolean),
    prazo: t.due_date ?? null,
    prio: t.priority?.priority ?? null,
    empresa: empresaDe(t),
    pontos: pontoDe(t),
    /** Quando a peca foi fechada no ClickUp. Vira data de conclusao aqui. */
    fechada: t.date_closed ?? null,
    /** Ultima movimentacao. Serve de conclusao para etapa de fim nao fechada. */
    atualizada: t.date_updated ?? null,
  }));

  fs.writeFileSync(SAIDA, JSON.stringify(limpo));

  const porStatus = new Map<string, number>();
  for (const t of limpo) porStatus.set(t.status, (porStatus.get(t.status) ?? 0) + 1);

  console.log(`${limpo.length} tarefas em ${SAIDA}`);
  console.log(`  com Empresa Tag: ${limpo.filter((t) => t.empresa).length}`);
  console.log(`  com Ponto MKT:   ${limpo.filter((t) => t.pontos !== null).length}`);
  for (const [status, n] of [...porStatus].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${status}`);
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
