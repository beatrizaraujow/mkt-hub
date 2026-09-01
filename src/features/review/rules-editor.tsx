"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { ClipboardList, Pencil, Plus } from "lucide-react";
import { FORMAT_GROUPS, SKILL_GROUPS, type OptionGroup } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { PopoverPanel, useAnchoredPopover } from "@/components/ui/popover";
import {
  addChecklistBatch,
  saveChecklistItem,
  saveRule,
  setChecklistActive,
  setCompanyReview,
  setMode,
  setRuleActive,
  type RulesState,
} from "./rules-actions";
import type { ChecklistRow, CompanyOption, RulesData, RuleRow } from "./rules-queries";

const field =
  "h-[38px] w-full rounded-[var(--radius-control)] border border-line bg-surface px-2.5 " +
  "text-[13.5px] text-ink focus:border-accent focus:outline-none";

const area =
  "w-full rounded-[var(--radius-control)] border border-line bg-surface px-2.5 py-2 " +
  "text-[13.5px] leading-relaxed text-ink focus:border-accent focus:outline-none";

const PROVIDER_LABEL = {
  anthropic: "Anthropic",
  gemini: "Google Gemini",
} as const;

const VERIFIER_LABEL = {
  maquina: "Máquina",
  pessoa: "Pessoa",
  fora: "Fora de escopo",
} as const;

type Verifier = keyof typeof VERIFIER_LABEL;

/**
 * As três respostas para "quem consegue verificar", com o custo de cada uma.
 *
 * Eram três linhas de um `<select>`, e num select a diferença entre elas
 * desaparece: as três viram nomes. É a decisão mais consequente do formulário —
 * ela define se a regra vira pedido ao modelo, item de checklist, ou nada.
 */
const VERIFIER_CARDS: Array<{ value: Verifier; title: string; hint: string }> = [
  {
    value: "pessoa",
    title: "Pessoa, depende de contexto que só alguém tem",
    hint: "Vira item de checklist, não entra no pedido do modelo.",
  },
  {
    value: "maquina",
    title: "Máquina, está escrito na peça",
    hint: "Entra no pedido do modelo. Pede o campo “como a máquina confere”.",
  },
  {
    value: "fora",
    title: "Fora de escopo, não é sobre a entrega",
    hint: "Fica registrada e não é conferida por ninguém automaticamente.",
  },
];

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" disabled={pending}>
      {pending ? "Salvando…" : label}
    </Button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-mono">{label}</span>
      {children}
      {hint ? <span className="text-[11.5px] text-faint">{hint}</span> : null}
    </label>
  );
}

/** O selo de quem confere, do tamanho de um código. */
function VerifierTag({ verifier }: { verifier: Verifier }) {
  return (
    <span
      className={cn(
        "rounded-[4px] border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]",
        verifier === "maquina" ? "border-accent/35 text-accent" : "border-line text-faint",
      )}
    >
      {VERIFIER_LABEL[verifier]}
    </span>
  );
}

/** As opções de recorte, com o "vale para qualquer um" sempre em primeiro. */
function ScopeSelects({
  companies,
  company,
  skill,
  format,
}: {
  companies: CompanyOption[];
  company: string;
  skill: string;
  format: string | null;
}) {
  return (
    <>
      <Field label="Empresa" hint="Em branco vale para todas. A regra da mãe alcança as sub-marcas.">
        <select name="companyId" defaultValue={company} className={cn(field, "cursor-pointer")}>
          <option value="">Todas as empresas</option>
          {companies.map((option) => (
            <option key={option.id} value={option.id}>
              {option.parentId ? "— " : ""}
              {option.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Tipo de peça" hint="Em branco vale para qualquer tipo.">
        <select name="skill" defaultValue={skill} className={cn(field, "cursor-pointer")}>
          <option value="">Qualquer tipo</option>
          {SKILL_GROUPS.map((group) => (
            <optgroup key={group.label ?? "outros"} label={group.label ?? ""}>
              {group.items.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>

      {format !== null && (
        <Field label="Formato" hint="Em branco vale para qualquer formato.">
          <select name="format" defaultValue={format} className={cn(field, "cursor-pointer")}>
            <option value="">Qualquer formato</option>
            {FORMAT_GROUPS.map((group, index) => (
              <optgroup key={index} label={group.label ?? ""}>
                {group.items.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ regra */

function RuleForm({
  rule,
  companies,
  siblings,
  onClose,
}: {
  rule: RuleRow | null;
  companies: CompanyOption[];
  /** As outras regras, para declarar qual esta substitui. */
  siblings: RuleRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  /**
   * O tipo do verificador vive no cliente porque ele decide o que a tela mostra:
   * "como a máquina confere" só existe para regra de máquina. Mostrar o campo
   * sempre, com um aviso de que não vale, é pedir para alguém preenchê-lo.
   */
  const [verifier, setVerifier] = useState<Verifier>(rule?.verifier ?? "pessoa");

  const [state, action] = useActionState<RulesState, FormData>(async (prev, form) => {
    const result = await saveRule(prev, form);
    if (result.ok) {
      router.refresh();
      onClose();
    }
    return result;
  }, {});

  return (
    <Modal
      label={rule ? "Editar regra" : "Nova regra"}
      title={rule ? "Editar regra" : "Nova regra"}
      subtitle={rule ? rule.code : "O sistema só aplica o que estiver aqui."}
      width={620}
      onClose={onClose}
    >
      <form action={action} className="flex flex-col gap-4 px-5 py-4">
        <input type="hidden" name="id" value={rule?.id ?? ""} />

        <Field label="Código" hint="Curto e estável: é o que aparece no parecer.">
          <input
            name="code"
            defaultValue={rule?.code ?? ""}
            required
            placeholder="CARB-01"
            className={cn(field, "font-mono")}
          />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="label-mono">Quem consegue verificar</span>
          <div className="flex flex-col gap-2">
            {VERIFIER_CARDS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-[var(--radius-control)] border px-3.5 py-3 transition-colors",
                  verifier === option.value
                    ? "border-brand-line bg-brand-soft"
                    : "border-line hover:bg-hover",
                )}
              >
                <input
                  type="radio"
                  name="verifier"
                  value={option.value}
                  checked={verifier === option.value}
                  onChange={() => setVerifier(option.value)}
                  className="mt-[3px] accent-[var(--brand)]"
                />
                <span>
                  <span className="block text-[13px] text-ink">{option.title}</span>
                  <span className="mt-0.5 block text-[11.5px] text-faint">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <span className="text-[11.5px] text-faint">
            Na dúvida entre máquina e pessoa, é pessoa: uma reprovação errada custa muito mais caro
            que uma verificação a menos.
          </span>
        </div>

        <Field label="A regra" hint="Uma frase, no imperativo, que dá para conferir olhando a peça.">
          <textarea name="text" defaultValue={rule?.text ?? ""} required rows={3} className={area} />
        </Field>

        <Field label="Por que existe" hint="Sem isso, em seis meses a regra vira superstição.">
          <textarea
            name="rationale"
            defaultValue={rule?.rationale ?? ""}
            rows={2}
            className={area}
          />
        </Field>

        {verifier === "maquina" ? (
          <Field label="Como a máquina confere" hint="O que procurar, em uma frase.">
            <textarea
              name="machineHint"
              defaultValue={rule?.machineHint ?? ""}
              rows={2}
              className={area}
            />
          </Field>
        ) : (
          <>
            {/*
              O valor continua indo no formulário para não sumir do banco quando
              alguém troca o tipo e volta atrás.
            */}
            <input type="hidden" name="machineHint" value={rule?.machineHint ?? ""} />
            <p className="rounded-[var(--radius-control)] border border-dashed border-line px-3.5 py-3 text-[11.5px] text-faint">
              “Como a máquina confere” não aparece: esta regra é de{" "}
              {verifier === "pessoa" ? "pessoa" : "fora de escopo"}.
            </p>
          </>
        )}

        <div className="grid gap-3.5 sm:grid-cols-3">
          <ScopeSelects
            companies={companies}
            company={rule?.companyId ?? ""}
            skill={rule?.skill ?? ""}
            format={rule?.format ?? ""}
          />
        </div>

        <Field
          label="Substitui a regra"
          hint="Só quando esta regra é a versão mais específica de outra. Conflito silencioso é bug: a substituição aparece no diagnóstico."
        >
          <select
            name="overridesRuleId"
            defaultValue={rule?.overridesRuleId ?? ""}
            className={cn(field, "cursor-pointer")}
          >
            <option value="">Não substitui nenhuma</option>
            {siblings
              .filter((other) => other.id !== rule?.id && other.isActive)
              .map((other) => (
                <option key={other.id} value={other.id}>
                  {other.code} — {other.text.slice(0, 60)}
                  {other.text.length > 60 ? "…" : ""}
                </option>
              ))}
          </select>
        </Field>

        <label className="flex items-start gap-2.5 rounded-[var(--radius-control)] border border-line px-3 py-2.5">
          <input
            type="checkbox"
            name="isBlocking"
            defaultChecked={rule?.isBlocking ?? false}
            className="mt-[3px] accent-[var(--danger)]"
          />
          <span>
            <span className="block text-[13px] text-ink">Inegociável</span>
            <span className="block text-[11.5px] text-faint">
              Reprova sozinha, sem ponderar com o resto. Sem isso o achado vira ajuste.
            </span>
          </span>
        </label>

        {state.error ? (
          <p role="alert" className="text-[13px] text-danger">
            {state.error}
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
          <Submit label="Salvar regra" />
        </ModalFooter>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------- checklist */

/**
 * Recorte com mais de um valor, em caixas de marcar.
 *
 * Um `<select multiple>` nativo resolveria em menos linhas e exige ctrl+clique
 * para marcar o segundo item — o tipo de interação que ninguém descobre
 * sozinho e que faz a pessoa marcar um valor achando que marcou três. Trinta
 * caixas numa caixa que rola é mais código e nenhuma pergunta.
 *
 * Os valores vão para o servidor separados por vírgula, no mesmo formato em que
 * a própria entrega guarda combinação — é o que `escopo.ts` compara.
 */
function MultiEscopo({
  name,
  label,
  hint,
  grupos,
  valor,
}: {
  name: string;
  label: string;
  hint: string;
  grupos: OptionGroup[];
  valor: string;
}) {
  const marcados = new Set(
    valor
      .split(",")
      .map((parte) => parte.trim().toLowerCase())
      .filter(Boolean),
  );

  return (
    <Field label={label} hint={hint}>
      <div className="scroll-thin max-h-[168px] overflow-y-auto rounded-[var(--radius-control)] border border-line bg-surface p-2">
        {grupos.map((grupo, indice) => (
          <div key={grupo.label ?? indice} className="mb-2 last:mb-0">
            {grupo.label ? <p className="label-mono mb-1">{grupo.label}</p> : null}
            <div className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
              {grupo.items.map((opcao) => (
                <label key={opcao} className="flex items-center gap-1.5 text-[12.5px] text-ink">
                  <input
                    type="checkbox"
                    name={name}
                    value={opcao}
                    defaultChecked={marcados.has(opcao.toLowerCase())}
                    className="accent-[var(--brand)]"
                  />
                  {opcao}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Field>
  );
}

function ChecklistForm({
  item,
  companies,
  rules,
  onClose,
}: {
  item: ChecklistRow | null;
  companies: CompanyOption[];
  /** Para ligar o item a regra que ele cobre — e o que faz o medidor medir. */
  rules: RuleRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState<RulesState, FormData>(async (prev, form) => {
    const result = await saveChecklistItem(prev, form);
    if (result.ok) {
      router.refresh();
      onClose();
    }
    return result;
  }, {});

  return (
    <Modal
      label={item ? "Editar item" : "Novo item de checklist"}
      title={item ? "Editar item" : "Novo item de checklist"}
      subtitle="O que a pessoa confere, e a máquina não."
      width={560}
      onClose={onClose}
    >
      <form action={action} className="flex flex-col gap-3.5 px-5 py-4">
        <input type="hidden" name="id" value={item?.id ?? ""} />

        <Field label="O item">
          <textarea name="text" defaultValue={item?.text ?? ""} required rows={2} className={area} />
        </Field>

        <Field
          label="Quando é cobrado"
          hint="São dois checklists: o da pré revisão é de quem produz, o da aprovação é de quem aprova."
        >
          <select
            name="momento"
            defaultValue={item?.momento ?? "operacional"}
            className={cn(field, "cursor-pointer")}
          >
            <option value="operacional">Pré revisão · quem produz</option>
            <option value="aprovacao">Aprovação · quem aprova</option>
          </select>
        </Field>

        <Field label="Empresa" hint="Em branco vale para todas. A da mãe alcança as sub-marcas.">
          <select
            name="companyId"
            defaultValue={item?.companyId ?? ""}
            className={cn(field, "cursor-pointer")}
          >
            <option value="">Todas as empresas</option>
            {companies.map((option) => (
              <option key={option.id} value={option.id}>
                {option.parentId ? "— " : ""}
                {option.name}
              </option>
            ))}
          </select>
        </Field>

        {/*
          Recorte com mais de um valor, e não é capricho: o bloco de estático
          do documento vale para Estático, Estático Ads e Capa de reels. Uma
          linha por formato faria "mexer no item universal" virar mexer em doze
          linhas — o contrário do que UNIVERSAL promete.
        */}
        <MultiEscopo
          name="format"
          label="Formatos"
          hint="Nenhum marcado vale para qualquer formato."
          grupos={FORMAT_GROUPS}
          valor={item?.format ?? ""}
        />

        <MultiEscopo
          name="skill"
          label="Tipos de peça"
          hint="Nenhum marcado vale para qualquer tipo."
          grupos={SKILL_GROUPS}
          valor={item?.skill ?? ""}
        />

        <label className="flex items-start gap-2.5 rounded-[var(--radius-control)] border border-line px-3 py-2.5">
          <input
            type="checkbox"
            name="onlyAfterRework"
            defaultChecked={item?.onlyAfterRework ?? false}
            className="mt-[3px] accent-[var(--brand)]"
          />
          <span>
            <span className="block text-[13px] text-ink">Só quando a peça já voltou por alteração</span>
            <span className="block text-[11.5px] text-faint">
              Na primeira passagem a pergunta não tem resposta possível, e perguntar mesmo assim
              ensina a marcar sem ler.
            </span>
          </span>
        </label>

        <Field
          label="Regra que este item cobre"
          hint="Obrigatória no medidor: é contra ela que a marcação da pessoa é comparada."
        >
          <select
            name="ruleId"
            defaultValue={item?.ruleId ?? ""}
            className={cn(field, "cursor-pointer")}
          >
            <option value="">Nenhuma</option>
            {rules
              .filter((rule) => rule.isActive)
              .map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.code} — {rule.text.slice(0, 60)}
                  {rule.text.length > 60 ? "…" : ""}
                </option>
              ))}
          </select>
        </Field>

        <label className="flex items-start gap-2.5 rounded-[var(--radius-control)] border border-line px-3 py-2.5">
          <input
            type="checkbox"
            name="dependsOnReport"
            defaultChecked={item?.dependsOnReport ?? false}
            className="mt-[3px] accent-[var(--brand)]"
          />
          <span>
            <span className="block text-[13px] text-ink">Só faz sentido com laudo</span>
            <span className="block text-[11.5px] text-faint">
              É o caso de “Li o laudo e assumo os pontos de atenção que sobraram”. Numa peça
              marcada como sem revisão automática este item some, e no lugar dele entra a
              co-assinatura da exceção.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2.5 rounded-[var(--radius-control)] border border-line px-3 py-2.5">
          <input
            type="checkbox"
            name="isReliabilityProbe"
            defaultChecked={item?.isReliabilityProbe ?? false}
            className="mt-[3px] accent-[var(--brand)]"
          />
          <span>
            <span className="block text-[13px] text-ink">Medidor de confiabilidade</span>
            <span className="block text-[11.5px] text-faint">
              A máquina também confere este. Ligue a regra acima, senão a medição compara com
              qualquer achado da entrega e o número deixa de dizer alguma coisa.
            </span>
          </span>
        </label>

        {state.error ? (
          <p role="alert" className="text-[13px] text-danger">
            {state.error}
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
          <Submit label="Salvar item" />
        </ModalFooter>
      </form>
    </Modal>
  );
}

/**
 * O checklist inteiro de uma combinação, de uma vez.
 *
 * Quem define o checklist é quem convive com o erro, e essa pessoa escreve
 * numa lista corrida — não em seis janelinhas seguidas. Se escrever custar
 * mais que conferir na mão, o checklist não nasce.
 */
function BatchForm({ companies, onClose }: { companies: CompanyOption[]; onClose: () => void }) {
  const router = useRouter();
  const [state, action] = useActionState<RulesState, FormData>(async (prev, form) => {
    const result = await addChecklistBatch(prev, form);
    if (result.ok) {
      router.refresh();
      onClose();
    }
    return result;
  }, {});

  return (
    <Modal
      label="Colar checklist"
      title="Colar checklist"
      subtitle="Um item por linha. Marcador na frente é ignorado."
      width={580}
      onClose={onClose}
    >
      <form action={action} className="flex flex-col gap-3.5 px-5 py-4">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <ScopeSelects companies={companies} company="" skill="" format={null} />
        </div>

        <Field
          label="Os itens"
          hint="Entre quatro e oito. Só o que a máquina não confere — item repetido vira marcação automática."
        >
          <textarea
            name="bulk"
            required
            rows={8}
            className={area}
            placeholder={"As fotos são do nosso acervo\nO nome do evento confere com o convite\nA oferta bate com o que foi combinado"}
          />
        </Field>

        {state.error ? (
          <p role="alert" className="text-[13px] text-danger">
            {state.error}
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
          <Submit label="Gravar lista" />
        </ModalFooter>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ lista */

function Toggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(onToggle)}
      className="text-[11.5px] text-faint transition-colors hover:text-ink disabled:opacity-50"
    >
      {active ? "desativar" : "reativar"}
    </button>
  );
}

function scopeOf(row: { companyName: string | null; skill: string | null; format?: string | null }) {
  const parts = [row.companyName ?? "todas as empresas"];
  if (row.skill) parts.push(row.skill);
  if (row.format) parts.push(row.format);
  return parts.join(" · ");
}

/**
 * O que muda sem deploy: o modo e o alcance por marca.
 *
 * Fica no topo porque e a primeira pergunta de quem abre esta tela quando algo
 * deu errado — "isso esta ligado?" —, e porque uma revisao automatica que so
 * se desliga com deploy fica ligada errada por um dia inteiro.
 *
 * **As empresas sao retangulos retos, nao chips arredondados.** O arredondado
 * ficou reservado para filtro, que so existe na Medicao. Estes retangulos
 * descrevem escopo: tirar um daqui desliga o revisor naquela marca de verdade,
 * e nao esconde linha nenhuma da tela.
 */
function OperationPanel({ data }: { data: RulesData }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const { open: incluirAberto, setOpen: setIncluir, rect, triggerRef, panelRef } =
    useAnchoredPopover(260);
  const silent = data.mode === "silencioso";

  const dentro = data.companies.filter((company) => !data.disabled.includes(company.id));
  const fora = data.companies.filter((company) => data.disabled.includes(company.id));

  const alternar = (companyId: string, ligar: boolean) =>
    start(async () => {
      await setCompanyReview(companyId, ligar);
      setIncluir(false);
      router.refresh();
    });

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[18rem] flex-1">
          <h2 className="label-mono">Operação</h2>

          <p className="mt-2.5 flex items-start gap-2.5 text-[13px] text-ink">
            <span
              aria-hidden
              className={cn(
                "mt-[7px] h-[6px] w-[6px] shrink-0 rounded-full",
                silent ? "bg-warning" : "bg-accent",
              )}
            />
            {silent
              ? "Silencioso — emite parecer e não move nada no pipeline."
              : "Ativo — só a reprovação anda sozinha, para Ajustar. Aprovado continua esperando alguém clicar."}
          </p>

          <p className="mt-2.5 text-[12px] text-faint">
            Quem responde: <span className="text-ink">{PROVIDER_LABEL[data.model.provider]}</span>
            {" · "}
            <span className="font-mono text-[11.5px]">{data.model.name}</span>
            {data.model.configured ? null : (
              <span className="text-danger"> · sem chave configurada: o revisor falha ao julgar</span>
            )}
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() =>
            start(async () => {
              await setMode(silent ? "ativo" : "silencioso");
              router.refresh();
            })
          }
          className="h-9 shrink-0 rounded-[var(--radius-control)] border border-line px-3.5 text-[12.5px] text-ink transition-colors hover:bg-hover disabled:opacity-50"
        >
          {silent ? "Deixar o revisor mover reprovados" : "Voltar para silencioso"}
        </button>
      </div>

      <div className="mt-4 border-t border-line pt-3.5">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-faint">
          Empresas em escopo · <span className="tnum">{dentro.length}</span> de{" "}
          <span className="tnum">{data.companies.length}</span>
        </p>

        <div className="mt-2.5 flex flex-wrap gap-2">
          {dentro.map((company) => (
            <button
              key={company.id}
              type="button"
              disabled={busy}
              onClick={() => alternar(company.id, false)}
              title="Desligar o revisor nesta marca"
              className="rounded-[6px] border border-line px-2.5 py-1.5 text-[12px] text-ink transition-colors hover:border-line-strong hover:bg-hover disabled:opacity-50"
            >
              {company.name}
            </button>
          ))}

          {fora.length > 0 && (
            <>
              <button
                ref={triggerRef}
                type="button"
                disabled={busy}
                onClick={() => setIncluir(!incluirAberto)}
                className="rounded-[6px] border border-dashed border-line px-2.5 py-1.5 text-[12px] text-faint transition-colors hover:text-ink disabled:opacity-50"
              >
                + incluir empresa
              </button>

              {incluirAberto && (
                <PopoverPanel rect={rect} panelRef={panelRef}>
                  <p className="border-b border-line px-3 py-2 text-[11.5px] text-faint">
                    Fora de escopo hoje
                  </p>
                  {fora.map((company) => (
                    <button
                      key={company.id}
                      type="button"
                      onClick={() => alternar(company.id, true)}
                      className="block w-full px-3 py-2 text-left text-[13px] text-ink transition-colors hover:bg-hover"
                    >
                      {company.name}
                    </button>
                  ))}
                </PopoverPanel>
              )}
            </>
          )}
        </div>

        <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
          Estes retângulos descrevem escopo, não filtram nada. Clicar num deles desliga o revisor
          naquela marca. Filtro só existe na Medição, e lá é arredondado.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- abas */

type Aba = "ativas" | "desativadas" | "fora";

const ABA_LABEL: Record<Aba, string> = {
  ativas: "Ativas",
  desativadas: "Desativadas",
  fora: "Fora de escopo",
};

/**
 * Regra desativada não some: parecer antigo continua citando o código, e um
 * código sem texto vira um parecer que não se explica. Ela sai da lista de
 * trabalho e vai para a aba ao lado.
 */
function abaDe(rule: RuleRow): Aba {
  if (!rule.isActive) return "desativadas";
  return rule.verifier === "fora" ? "fora" : "ativas";
}

export function RulesEditor({ data }: { data: RulesData }) {
  const router = useRouter();
  const [ruleForm, setRuleForm] = useState<{ open: boolean; rule: RuleRow | null }>({
    open: false,
    rule: null,
  });
  const [itemForm, setItemForm] = useState<{ open: boolean; item: ChecklistRow | null }>({
    open: false,
    item: null,
  });
  const [batchOpen, setBatchOpen] = useState(false);
  const [aba, setAba] = useState<Aba>("ativas");

  const porAba: Record<Aba, RuleRow[]> = { ativas: [], desativadas: [], fora: [] };
  for (const rule of data.rules) porAba[abaDe(rule)].push(rule);

  const total = data.counts.maquina + data.counts.pessoa + data.counts.fora;
  const visiveis = porAba[aba];

  return (
    <div className="flex flex-col gap-4">
      <OperationPanel data={data} />

      {data.gaps.length > 0 && (
        <section className="rounded-[var(--radius-card)] border border-warning/40 bg-warning-soft p-4">
          <h2 className="label-mono text-warning">Recortes sem regra</h2>
          <p className="mb-2.5 mt-1.5 text-[12px] text-ink">
            Combinações que o time entrega e que o revisor não tem como conferir. Onde não há
            regra, o sistema não inventa uma: o buraco fica visível e quem decide é você.
          </p>
          <div className="flex flex-col">
            {data.gaps.map((gap) => (
              <div
                key={`${gap.companyId}-${gap.skill}`}
                className="flex flex-wrap items-baseline gap-2 border-b border-warning/20 py-1.5 text-[13px] last:border-b-0"
              >
                <span className="text-ink">{gap.companyName}</span>
                <span className="text-faint">·</span>
                <span className="text-ink">{gap.skill}</span>
                <span className="tnum text-[11.5px] text-faint">
                  {gap.items} entrega{gap.items === 1 ? "" : "s"}
                </span>
                {gap.hasChecklist ? (
                  <span className="ml-auto text-[11.5px] text-faint">tem checklist humano</span>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-[var(--radius-card)] border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-3.5">
          <div>
            <h2 className="label-mono">Regras</h2>
            <p className="mt-1.5 text-[12px] text-faint">
              {total === 0
                ? "Nenhuma regra ainda. Enquanto não houver, o revisor não emite parecer."
                : `${porAba.ativas.length} ativa${porAba.ativas.length === 1 ? "" : "s"} · ${data.counts.maquina} de máquina · ${data.counts.pessoa} de pessoa`}
            </p>
          </div>
          <Button size="sm" onClick={() => setRuleForm({ open: true, rule: null })}>
            <Plus size={14} strokeWidth={2.5} />
            Nova regra
          </Button>
        </div>

        <div className="flex gap-5 border-b border-line px-4">
          {(Object.keys(ABA_LABEL) as Aba[]).map((chave) => (
            <button
              key={chave}
              type="button"
              onClick={() => setAba(chave)}
              className={cn(
                "-mb-px border-b-2 pb-2.5 text-[12.5px] transition-colors",
                aba === chave
                  ? "border-brand-line text-ink"
                  : "border-transparent text-muted hover:text-ink",
              )}
            >
              {ABA_LABEL[chave]}{" "}
              <span className="tnum text-faint">{porAba[chave].length}</span>
            </button>
          ))}
        </div>

        {visiveis.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-faint">
            {aba === "ativas"
              ? "Comece pelas regras que já existem na prática: as correções que se repetem."
              : `Nenhuma regra ${aba === "fora" ? "fora de escopo" : "desativada"}.`}
          </p>
        ) : (
          <div className="flex flex-col">
            {visiveis.map((rule) => (
              <div
                key={rule.id}
                className={cn(
                  "border-b border-line px-4 py-3.5 last:border-b-0",
                  !rule.isActive && "opacity-60",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-[11.5px] font-medium text-ink">{rule.code}</code>
                  <VerifierTag verifier={rule.verifier} />
                  {rule.isBlocking && (
                    <span className="rounded-[4px] border border-danger/35 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-danger">
                      inegociável
                    </span>
                  )}
                  {rule.version > 1 && (
                    <span className="text-[11px] text-faint" title="Quantas vezes o texto mudou.">
                      v{rule.version}
                    </span>
                  )}

                  <span className="ml-auto flex items-center gap-3">
                    <span className="text-[11.5px] text-faint">{scopeOf(rule)}</span>
                    <button
                      type="button"
                      aria-label={`Editar ${rule.code}`}
                      onClick={() => setRuleForm({ open: true, rule })}
                      className="flex items-center gap-1 text-[11.5px] text-faint transition-colors hover:text-ink"
                    >
                      <Pencil size={12} />
                      editar
                    </button>
                    <Toggle
                      active={rule.isActive}
                      onToggle={async () => {
                        await setRuleActive(rule.id, !rule.isActive);
                        router.refresh();
                      }}
                    />
                  </span>
                </div>

                <p className="mt-2 text-[13px] leading-relaxed text-ink">{rule.text}</p>
                {rule.rationale && (
                  <p className="mt-1 text-[12px] leading-relaxed text-faint">{rule.rationale}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-faint">
          Desativar, nunca apagar: parecer antigo continua citando a regra pelo código, e código sem
          texto vira parecer que não se explica.
        </p>
      </section>

      <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <div className="mb-3.5 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="label-mono">Checklist da pessoa</h2>
            <p className="mt-1.5 max-w-[62ch] text-[12px] text-faint">
              Entre quatro e oito itens por combinação. Acima disso ninguém lê, e pedir o que a
              máquina já confere faz a pessoa marcar tudo no automático em duas semanas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="subtle" onClick={() => setBatchOpen(true)}>
              <ClipboardList size={14} strokeWidth={2.5} />
              Colar lista
            </Button>
            <Button size="sm" variant="subtle" onClick={() => setItemForm({ open: true, item: null })}>
              <Plus size={14} strokeWidth={2.5} />
              Novo item
            </Button>
          </div>
        </div>

        {data.checklist.length === 0 ? (
          <p className="rounded-[var(--radius-control)] border border-dashed border-line px-3 py-6 text-center text-[13px] text-faint">
            Nenhum item ainda.
          </p>
        ) : (
          <div className="flex flex-col">
            {data.checklist.map((item) => {
              const codigo = item.ruleId
                ? (data.rules.find((rule) => rule.id === item.ruleId)?.code ?? null)
                : null;

              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex flex-wrap items-baseline gap-3 border-b border-line py-2.5 first:pt-0 last:border-b-0",
                    !item.isActive && "opacity-60",
                  )}
                >
                  <span className="min-w-[16rem] flex-1 text-[13px] leading-relaxed text-ink">
                    {item.text}
                    {item.isReliabilityProbe && (
                      <span className="ml-2 whitespace-nowrap rounded-[4px] border border-line px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-faint">
                        medidor{codigo ? ` · ${codigo}` : ""}
                      </span>
                    )}
                    {item.momento === "aprovacao" && (
                      <span className="ml-2 whitespace-nowrap rounded-[4px] border border-brand-line px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-brand-ink">
                        aprovação
                      </span>
                    )}
                    {item.onlyAfterRework && (
                      <span className="ml-2 whitespace-nowrap rounded-[4px] border border-line px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-faint">
                        só após alteração
                      </span>
                    )}
                    {item.dependsOnReport && (
                      <span className="ml-2 whitespace-nowrap rounded-[4px] border border-line px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-faint">
                        depende do laudo
                      </span>
                    )}
                  </span>
                  <span className="text-[11.5px] text-faint">{scopeOf(item)}</span>
                  <span className="flex items-center gap-3">
                    <button
                      type="button"
                      aria-label="Editar item"
                      onClick={() => setItemForm({ open: true, item })}
                      className="flex items-center gap-1 text-[11.5px] text-faint transition-colors hover:text-ink"
                    >
                      <Pencil size={12} />
                      editar
                    </button>
                    <Toggle
                      active={item.isActive}
                      onToggle={async () => {
                        await setChecklistActive(item.id, !item.isActive);
                        router.refresh();
                      }}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {ruleForm.open && (
        <RuleForm
          rule={ruleForm.rule}
          companies={data.companies}
          siblings={data.rules}
          onClose={() => setRuleForm({ open: false, rule: null })}
        />
      )}

      {itemForm.open && (
        <ChecklistForm
          item={itemForm.item}
          companies={data.companies}
          rules={data.rules}
          onClose={() => setItemForm({ open: false, item: null })}
        />
      )}

      {batchOpen && <BatchForm companies={data.companies} onClose={() => setBatchOpen(false)} />}
    </div>
  );
}
