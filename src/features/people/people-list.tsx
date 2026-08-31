"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Check, Copy, Mail, Plus, RotateCcw, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/db/schema";
import {
  createPerson,
  resendInvite,
  setPersonActive,
  updatePerson,
  type PeopleState,
} from "./actions";
import type { PersonRow } from "./queries";

export type CompanyOption = { id: string; name: string; parentId: string | null };

const ROLES: Array<{ value: UserRole; label: string; hint: string }> = [
  { value: "observador", label: "Observador", hint: "Só olha. Não cria nem edita." },
  { value: "colaborador", label: "Colaborador", hint: "Faz o trabalho: cria, edita, lança tempo." },
  { value: "gestor", label: "Gestor", hint: "Tudo do colaborador, mais gerir pessoas e projetos." },
  { value: "admin", label: "Administrador", hint: "Enxerga todas as empresas, sem exceção." },
];

const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label])) as Record<
  UserRole,
  string
>;

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase();
}

function when(date: Date | null) {
  if (!date) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

/**
 * O link aparece uma vez só — mesmo quando o e-mail sai.
 *
 * Parece redundante e não é: mensagem cai em spam, endereço tem letra trocada,
 * SMTP fica fora do ar. Enquanto o link estiver na tela, nenhuma dessas coisas
 * impede a pessoa de entrar hoje.
 */
function InviteLink({
  token,
  name,
  sentTo,
  mailError,
  onDone,
}: {
  token: string;
  name: string;
  sentTo?: string;
  mailError?: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/convite/${token}`;

  return (
    <Modal
      label="Convite"
      title={sentTo ? "Convite enviado" : "Convite gerado"}
      subtitle={name}
      width={560}
      onClose={onDone}
    >
      <div className="flex flex-col gap-3 px-5 py-4">
        {sentTo ? (
          <p className="text-[13.5px] leading-relaxed text-muted">
            Mandei para <span className="text-ink">{sentTo}</span>. Guarde o link abaixo até{" "}
            {name.split(" ")[0]} confirmar que recebeu — se cair no spam, é por ele que a pessoa
            entra.
          </p>
        ) : (
          <p className="text-[13.5px] leading-relaxed text-muted">
            Mande este link para {name.split(" ")[0]}. É por ele que a pessoa define a própria senha
            — ela não passa por você, e ninguém precisa trocá-la depois.
          </p>
        )}

        {mailError && (
          <p className="rounded-[var(--radius-control)] border border-line bg-sunk px-3 py-2 text-[12.5px] text-warning">
            O e-mail não saiu: {mailError}. O convite vale do mesmo jeito — entregue o link na mão.
          </p>
        )}

        <code className="block overflow-x-auto whitespace-nowrap rounded-[var(--radius-control)] border border-line bg-sunk px-3 py-2 font-mono text-[12px] text-ink">
          {url}
        </code>

        <p className="text-[12px] text-faint">
          Vale por 7 dias e serve uma vez. Depois disso, gere outro na lista.
        </p>

        <ModalFooter>
          <Button
            size="md"
            variant="subtle"
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
          >
            {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
            {copied ? "Copiado" : "Copiar link"}
          </Button>
          <Button size="md" onClick={onDone}>
            Pronto
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" disabled={pending}>
      {pending ? "Salvando…" : label}
    </Button>
  );
}

function CompanyPicker({
  companies,
  selected,
  disabled,
}: {
  companies: CompanyOption[];
  selected: string[];
  disabled?: boolean;
}) {
  const parents = companies.filter((c) => !c.parentId);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-mono">Empresas</span>
      {disabled ? (
        <p className="text-[12.5px] text-faint">
          Administrador enxerga todas as empresas da organização. A escolha abaixo não se aplica.
        </p>
      ) : null}

      <div
        className={cn(
          "scroll-thin max-h-[190px] overflow-y-auto rounded-[var(--radius-control)] border border-line p-2",
          disabled && "pointer-events-none opacity-45",
        )}
      >
        {parents.map((parent) => (
          <div key={parent.id}>
            <label className="flex items-center gap-2 py-1 text-[13px] text-ink">
              <input
                type="checkbox"
                name="companyIds"
                value={parent.id}
                defaultChecked={selected.includes(parent.id)}
                className="accent-[var(--brand)]"
              />
              {parent.name}
            </label>
            {companies
              .filter((c) => c.parentId === parent.id)
              .map((child) => (
                <label
                  key={child.id}
                  className="flex items-center gap-2 py-1 pl-5 text-[12.5px] text-muted"
                >
                  <input
                    type="checkbox"
                    name="companyIds"
                    value={child.id}
                    defaultChecked={selected.includes(child.id)}
                    className="accent-[var(--brand)]"
                  />
                  {child.name}
                </label>
              ))}
          </div>
        ))}
      </div>

      <p className="text-[11.5px] text-faint">
        Acesso à empresa mãe alcança as sub-marcas dela automaticamente.
      </p>
    </div>
  );
}

export function PeopleList({
  people,
  companies,
  meId,
  canCreateAdmin,
}: {
  people: PersonRow[];
  companies: CompanyOption[];
  meId: string;
  canCreateAdmin: boolean;
}) {
  const [invite, setInvite] = useState<{
    token: string;
    name: string;
    sentTo?: string;
    mailError?: string;
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PersonRow | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>("colaborador");

  const [createState, createAction] = useActionState<PeopleState, FormData>(async (prev, form) => {
    const result = await createPerson(prev, form);
    if (result.ok && result.token) {
      setInvite({
        token: result.token,
        name: result.name ?? "",
        sentTo: result.sentTo,
        mailError: result.mailError,
      });
      setCreating(false);
      setRole("colaborador");
    }
    return result;
  }, {});

  const [editState, editAction] = useActionState<PeopleState, FormData>(async (prev, form) => {
    const result = await updatePerson(prev, form);
    if (result.ok) setEditing(null);
    return result;
  }, {});

  function run(fn: () => Promise<PeopleState>) {
    setError(null);
    start(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else if (result.token) {
        setInvite({
          token: result.token,
          name: result.name ?? "",
          sentTo: result.sentTo,
          mailError: result.mailError,
        });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-faint">
          <span className="tnum">{people.filter((p) => p.isActive).length}</span> ativa(s) ·{" "}
          <span className="tnum">{people.filter((p) => p.pending).length}</span> sem entrar ainda
        </p>
        <Button
          size="sm"
          onClick={() => {
            setRole("colaborador");
            setCreating(true);
          }}
        >
          <Plus size={15} strokeWidth={2} />
          Convidar pessoa
        </Button>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] border border-danger/40 bg-danger-soft px-3 py-2 text-[13px] text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        {people.map((person) => (
          <div
            key={person.id}
            className={cn(
              "flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0",
              !person.isActive && "opacity-55",
            )}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sunk text-[11.5px] font-medium text-muted">
              {initials(person.name)}
            </span>

            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[13.5px] text-ink">
                <span className="truncate font-medium">{person.name}</span>
                {person.id === meId && <span className="text-[11.5px] text-faint">você</span>}
              </p>
              <p className="truncate text-[12px] text-faint">
                {person.email}
                {person.jobTitle ? ` · ${person.jobTitle}` : ""}
              </p>
            </div>

            <span className="shrink-0 rounded-[5px] bg-sunk px-1.5 py-0.5 text-[11.5px] text-muted">
              {ROLE_LABEL[person.role]}
            </span>

            <span className="w-[112px] shrink-0 text-right text-[11.5px] text-faint">
              {!person.isActive
                ? "desativada"
                : person.pending
                  ? person.inviteExpired
                    ? "convite vencido"
                    : "convite enviado"
                  : person.lastLoginAt
                    ? `entrou ${when(person.lastLoginAt)}`
                    : "nunca entrou"}
            </span>

            <div className="flex shrink-0 items-center gap-1">
              {person.pending && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => resendInvite(person.id))}
                  title="Gerar convite novo"
                  className="grid h-7 w-7 place-items-center rounded-[var(--radius-control)] text-faint transition-colors hover:bg-hover hover:text-ink"
                >
                  <Mail size={14} />
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setRole(person.role);
                  setEditing(person);
                }}
                className="h-7 rounded-[var(--radius-control)] px-2 text-[12.5px] text-muted transition-colors hover:bg-hover hover:text-ink"
              >
                Acesso
              </button>

              {person.id !== meId && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => setPersonActive(person.id, !person.isActive))}
                  title={person.isActive ? "Desativar" : "Reativar"}
                  className="grid h-7 w-7 place-items-center rounded-[var(--radius-control)] text-faint transition-colors hover:bg-hover hover:text-ink"
                >
                  {person.isActive ? <UserMinus size={14} /> : <RotateCcw size={14} />}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {creating && (
        <Modal
          label="Convidar pessoa"
          title="Convidar pessoa"
          subtitle="A conta nasce sem senha. Quem define é a própria pessoa, pelo link."
          onClose={() => setCreating(false)}
        >
          <form action={createAction} className="flex flex-col gap-4 px-5 py-4">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="label-mono">Nome</span>
                <input
                  name="name"
                  required
                  autoFocus
                  maxLength={120}
                  className="h-[38px] rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[13.5px] text-ink focus:border-accent focus:outline-none"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="label-mono">E-mail</span>
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={160}
                  className="h-[38px] rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[13.5px] text-ink focus:border-accent focus:outline-none"
                />
              </label>

              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="label-mono">Função</span>
                <input
                  name="jobTitle"
                  maxLength={80}
                  placeholder="Editor de vídeo, Designer, Gestor de tráfego…"
                  className="h-[38px] rounded-[var(--radius-control)] border border-line bg-surface px-2.5 text-[13.5px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                />
              </label>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="label-mono">Papel</span>
              <div className="flex flex-col gap-1">
                {ROLES.filter((r) => canCreateAdmin || r.value !== "admin").map((option) => (
                  <label
                    key={option.value}
                    className="flex items-baseline gap-2 rounded-[var(--radius-control)] px-1 py-1 text-[13px] text-ink hover:bg-hover"
                  >
                    <input
                      type="radio"
                      name="role"
                      value={option.value}
                      checked={role === option.value}
                      onChange={() => setRole(option.value)}
                      className="accent-[var(--brand)]"
                    />
                    <span>
                      {option.label}
                      <span className="ml-1.5 text-[11.5px] text-faint">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <CompanyPicker companies={companies} selected={[]} disabled={role === "admin"} />

            {createState?.error ? (
              <p role="alert" className="text-[13px] text-danger">
                {createState.error}
              </p>
            ) : null}

            <ModalFooter>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="h-9 rounded-[var(--radius-control)] px-3 text-sm text-muted transition-colors hover:text-ink"
              >
                Cancelar
              </button>
              <Submit label="Gerar convite" />
            </ModalFooter>
          </form>
        </Modal>
      )}

      {editing && (
        <Modal
          label="Acesso"
          title={editing.name}
          subtitle={editing.email}
          onClose={() => setEditing(null)}
        >
          <form action={editAction} className="flex flex-col gap-4 px-5 py-4">
            <input type="hidden" name="id" value={editing.id} />

            <div className="flex flex-col gap-1.5">
              <span className="label-mono">Papel</span>
              <div className="flex flex-col gap-1">
                {ROLES.filter((r) => canCreateAdmin || r.value !== "admin").map((option) => (
                  <label
                    key={option.value}
                    className="flex items-baseline gap-2 rounded-[var(--radius-control)] px-1 py-1 text-[13px] text-ink hover:bg-hover"
                  >
                    <input
                      type="radio"
                      name="role"
                      value={option.value}
                      checked={role === option.value}
                      onChange={() => setRole(option.value)}
                      className="accent-[var(--brand)]"
                    />
                    <span>
                      {option.label}
                      <span className="ml-1.5 text-[11.5px] text-faint">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <CompanyPicker
              companies={companies}
              selected={editing.companyIds}
              disabled={role === "admin"}
            />

            {editState?.error ? (
              <p role="alert" className="text-[13px] text-danger">
                {editState.error}
              </p>
            ) : null}

            <ModalFooter>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="h-9 rounded-[var(--radius-control)] px-3 text-sm text-muted transition-colors hover:text-ink"
              >
                Cancelar
              </button>
              <Submit label="Salvar acesso" />
            </ModalFooter>
          </form>
        </Modal>
      )}

      {invite && (
        <InviteLink
          token={invite.token}
          name={invite.name}
          sentTo={invite.sentTo}
          mailError={invite.mailError}
          onDone={() => setInvite(null)}
        />
      )}

      <p className="flex items-start gap-2 text-[12px] text-faint">
        <UserPlus size={13} className="mt-[2px] shrink-0" />
        <span>
          O link do convite não é enviado por e-mail ainda — o projeto não tem serviço de envio.
          Copie e mande pelo canal que você já usa. Quando houver serviço, o envio entra sem mudar
          mais nada.
        </span>
      </p>
    </div>
  );
}
