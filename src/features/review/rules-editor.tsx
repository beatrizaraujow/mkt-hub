"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Pencil, Plus } from "lucide-react";
import { FORMAT_GROUPS, SKILL_GROUPS } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/modal";
import {
  saveChecklistItem,
  saveRule,
  setChecklistActive,
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

const VERIFIER_LABEL = {
  maquina: "Máquina",
  pessoa: "Pessoa",
  fora: "Fora de escopo",
} as const;

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
  onClose,
}: {
  rule: RuleRow | null;
  companies: CompanyOption[];
  onClose: () => void;
}) {
  const router = useRouter();
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
      <form action={action} className="flex flex-col gap-3.5 px-5 py-4">
        <input type="hidden" name="id" value={rule?.id ?? ""} />

        <div className="grid gap-3.5 sm:grid-cols-[160px_1fr]">
          <Field label="Código" hint="Curto e estável: é o que aparece no parecer.">
            <input
              name="code"
              defaultValue={rule?.code ?? ""}
              required
              placeholder="CARB-01"
              className={cn(field, "font-mono")}
            />
          </Field>

          <Field label="Quem consegue verificar" hint="Na dúvida entre máquina e pessoa, é pessoa.">
            <select
              name="verifier"
              defaultValue={rule?.verifier ?? "pessoa"}
              className={cn(field, "cursor-pointer")}
            >
              <option value="maquina">Máquina — dá para conferir olhando a entrega</option>
              <option value="pessoa">Pessoa — depende de contexto que só alguém tem</option>
              <option value="fora">Fora de escopo — não é sobre a entrega</option>
            </select>
          </Field>
        </div>

        <Field label="A regra">
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

        <Field
          label="Como a máquina confere"
          hint="Só vale para regra de máquina. O que procurar, em uma frase."
        >
          <textarea
            name="machineHint"
            defaultValue={rule?.machineHint ?? ""}
            rows={2}
            className={area}
          />
        </Field>

        <div className="grid gap-3.5 sm:grid-cols-3">
          <ScopeSelects
            companies={companies}
            company={rule?.companyId ?? ""}
            skill={rule?.skill ?? ""}
            format={rule?.format ?? ""}
          />
        </div>

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
              Violou, reprova. Sem isso o achado vira ajuste.
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

function ChecklistForm({
  item,
  companies,
  onClose,
}: {
  item: ChecklistRow | null;
  companies: CompanyOption[];
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

        <div className="grid gap-3.5 sm:grid-cols-2">
          <ScopeSelects
            companies={companies}
            company={item?.companyId ?? ""}
            skill={item?.skill ?? ""}
            format={null}
          />
        </div>

        <label className="flex items-start gap-2.5 rounded-[var(--radius-control)] border border-line px-3 py-2.5">
          <input
            type="checkbox"
            name="isReliabilityProbe"
            defaultChecked={item?.isReliabilityProbe ?? false}
            className="mt-[3px] accent-[var(--accent)]"
          />
          <span>
            <span className="block text-[13px] text-ink">Medidor de confiabilidade</span>
            <span className="block text-[11.5px] text-faint">
              A máquina também confere este. Serve para comparar, não para dobrar o trabalho.
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

/* ------------------------------------------------------------------ lista */

function Toggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(onToggle)}
      className="text-[12px] text-faint transition-colors hover:text-ink disabled:opacity-50"
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

  const total = data.counts.maquina + data.counts.pessoa + data.counts.fora;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="label-mono">Regras</h2>
            <p className="mt-1 text-[12px] text-faint">
              {total === 0
                ? "Nenhuma regra ainda. Enquanto não houver, o revisor não emite parecer."
                : `${data.counts.maquina} de máquina · ${data.counts.pessoa} de pessoa · ${data.counts.fora} fora de escopo`}
            </p>
          </div>
          <Button size="sm" onClick={() => setRuleForm({ open: true, rule: null })}>
            <Plus size={14} strokeWidth={2.5} />
            Nova regra
          </Button>
        </div>

        {data.rules.length === 0 ? (
          <p className="rounded-[var(--radius-control)] border border-dashed border-line px-3 py-6 text-center text-[13px] text-faint">
            Comece pelas regras que já existem na prática: as correções que se repetem.
          </p>
        ) : (
          <div className="flex flex-col">
            {data.rules.map((rule) => (
              <div
                key={rule.id}
                className={cn(
                  "border-b border-line py-2.5 last:border-b-0",
                  !rule.isActive && "opacity-50",
                )}
              >
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
                  <span className="text-[11.5px] text-faint">{scopeOf(rule)}</span>

                  <span className="ml-auto flex items-center gap-3">
                    <Toggle
                      active={rule.isActive}
                      onToggle={async () => {
                        await setRuleActive(rule.id, !rule.isActive);
                        router.refresh();
                      }}
                    />
                    <button
                      type="button"
                      aria-label={`Editar ${rule.code}`}
                      onClick={() => setRuleForm({ open: true, rule })}
                      className="text-faint transition-colors hover:text-ink"
                    >
                      <Pencil size={13} />
                    </button>
                  </span>
                </div>

                <p className="mt-1 text-[13px] leading-relaxed text-ink">{rule.text}</p>
                {rule.rationale && (
                  <p className="mt-0.5 text-[12px] text-faint">{rule.rationale}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="label-mono">Checklist da pessoa</h2>
            <p className="mt-1 text-[12px] text-faint">
              Entre quatro e oito itens por combinação. Pedir o que a máquina já confere faz a
              pessoa marcar tudo no automático em duas semanas.
            </p>
          </div>
          <Button size="sm" variant="subtle" onClick={() => setItemForm({ open: true, item: null })}>
            <Plus size={14} strokeWidth={2.5} />
            Novo item
          </Button>
        </div>

        {data.checklist.length === 0 ? (
          <p className="rounded-[var(--radius-control)] border border-dashed border-line px-3 py-6 text-center text-[13px] text-faint">
            Nenhum item ainda.
          </p>
        ) : (
          <div className="flex flex-col">
            {data.checklist.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "flex flex-wrap items-baseline gap-2 border-b border-line py-2 last:border-b-0",
                  !item.isActive && "opacity-50",
                )}
              >
                <span className="text-[13px] text-ink">{item.text}</span>
                <span className="text-[11.5px] text-faint">{scopeOf(item)}</span>
                {item.isReliabilityProbe && (
                  <span className="rounded-[5px] bg-sunk px-1.5 py-0.5 text-[11px] text-faint">
                    medidor
                  </span>
                )}
                <span className="ml-auto flex items-center gap-3">
                  <Toggle
                    active={item.isActive}
                    onToggle={async () => {
                      await setChecklistActive(item.id, !item.isActive);
                      router.refresh();
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Editar item"
                    onClick={() => setItemForm({ open: true, item })}
                    className="text-faint transition-colors hover:text-ink"
                  >
                    <Pencil size={13} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {ruleForm.open && (
        <RuleForm
          rule={ruleForm.rule}
          companies={data.companies}
          onClose={() => setRuleForm({ open: false, rule: null })}
        />
      )}

      {itemForm.open && (
        <ChecklistForm
          item={itemForm.item}
          companies={data.companies}
          onClose={() => setItemForm({ open: false, item: null })}
        />
      )}
    </div>
  );
}
