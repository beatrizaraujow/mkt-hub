"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { changeOwnPassword, type PeopleState } from "./actions";

const field =
  "h-[38px] w-full rounded-[var(--radius-control)] border border-line bg-surface px-2.5 " +
  "text-[13.5px] text-ink focus:border-accent focus:outline-none";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" disabled={pending}>
      {pending ? "Trocando…" : "Trocar senha"}
    </Button>
  );
}

/** A senha é da pessoa. Ninguém que administra precisa saber qual é. */
export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<PeopleState, FormData>(async (prev, form) => {
    const result = await changeOwnPassword(prev, form);
    if (result.ok) setOpen(false);
    return result;
  }, {});

  if (!open) {
    return (
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[13px] text-accent hover:underline"
        >
          Trocar minha senha
        </button>
        {state?.ok && <span className="text-[12.5px] text-success">Senha trocada.</span>}
      </div>
    );
  }

  return (
    <form
      action={action}
      className="mt-4 flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4"
    >
      <label className="flex flex-col gap-1.5">
        <span className="label-mono">Senha atual</span>
        <input name="current" type="password" required autoComplete="current-password" className={field} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="label-mono">Senha nova</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={field}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="label-mono">Repita a nova</span>
        <input
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={field}
        />
      </label>

      {state?.error ? (
        <p role="alert" className="text-[13px] text-danger">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 rounded-[var(--radius-control)] px-3 text-sm text-muted transition-colors hover:text-ink"
        >
          Cancelar
        </button>
        <Submit />
      </div>
    </form>
  );
}
