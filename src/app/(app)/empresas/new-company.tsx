"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { createCompany, type CompanyState } from "./actions";

const COLORS = ["#0d5c59", "#c98a2e", "#b3261e", "#2e7d4f", "#4a5bb5", "#7a4a9e"];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Criando…" : "Criar empresa"}
    </Button>
  );
}

export function NewCompany() {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const formRef = useRef<HTMLFormElement>(null);

  // Fecha dentro da propria acao. Fechar num efeito dispararia render em
  // cascata — e o eslint do React reclama, com razao.
  const [state, action] = useActionState<CompanyState, FormData>(async (prev, formData) => {
    const result = await createCompany(prev, formData);
    if (result.ok) {
      formRef.current?.reset();
      setOpen(false);
    }
    return result;
  }, {});

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={15} strokeWidth={2} />
        Nova empresa
      </Button>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="w-full rounded-[var(--radius-card)] border border-line bg-surface p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] font-medium text-ink">Nova empresa</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Cancelar"
          className="text-faint transition-colors hover:text-ink"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <Label htmlFor="company-name">Nome</Label>
          <Input id="company-name" name="name" autoFocus required placeholder="Carbone Educação" />
        </div>

        <div>
          <Label>Cor</Label>
          <div className="flex h-9 items-center gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Cor ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                style={{ background: c }}
                className={
                  color === c
                    ? "h-6 w-6 rounded-full ring-2 ring-brand-line ring-offset-2 ring-offset-[var(--surface)]"
                    : "h-6 w-6 rounded-full"
                }
              />
            ))}
          </div>
          <input type="hidden" name="color" value={color} />
        </div>

        <Submit />
      </div>

      {state.error ? (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
