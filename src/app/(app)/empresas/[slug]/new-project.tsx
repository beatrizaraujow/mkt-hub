"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { createProject, type ProjectState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Criando…" : "Criar projeto"}
    </Button>
  );
}

export function NewProject({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [state, action] = useActionState<ProjectState, FormData>(async (prev, formData) => {
    const result = await createProject(prev, formData);
    if (result.ok) {
      formRef.current?.reset();
      setOpen(false);
    }
    return result;
  }, {});

  if (!open) {
    return (
      <Button size="sm" variant="subtle" onClick={() => setOpen(true)}>
        <Plus size={15} strokeWidth={2} />
        Novo projeto
      </Button>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="w-full rounded-[var(--radius-card)] border border-line bg-surface p-4"
    >
      <input type="hidden" name="companyId" value={companyId} />

      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] font-medium text-ink">Novo projeto</p>
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
        <div className="min-w-[220px] flex-1">
          <Label htmlFor="project-name">Nome</Label>
          <Input
            id="project-name"
            name="name"
            autoFocus
            required
            placeholder="Campanha de lançamento"
          />
        </div>
        <div>
          <Label htmlFor="project-due">Prazo</Label>
          <Input id="project-due" name="dueDate" type="date" className="w-[160px]" />
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
