"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { acceptInvite, type AcceptState } from "./actions";

const field =
  "h-[42px] w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 " +
  "text-[14px] text-ink focus:border-accent focus:outline-none";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" disabled={pending} className="w-full">
      {pending ? "Entrando…" : "Definir senha e entrar"}
    </Button>
  );
}

export function AcceptInviteForm({ token }: { token: string }) {
  // O sucesso nao volta para ca: a action redireciona, igual ao login.
  const [state, action] = useActionState<AcceptState, FormData>(acceptInvite, {});

  return (
    <form action={action} className="mt-5 flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />

      <label className="flex flex-col gap-1.5">
        <span className="label-mono">Senha</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoFocus
          autoComplete="new-password"
          className={field}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="label-mono">Repita a senha</span>
        <input
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={field}
        />
      </label>

      <p className="text-[12px] text-faint">Pelo menos 8 caracteres.</p>

      {state?.error ? (
        <p role="alert" className="text-[13px] text-danger">
          {state.error}
        </p>
      ) : null}

      <Submit />
    </form>
  );
}
