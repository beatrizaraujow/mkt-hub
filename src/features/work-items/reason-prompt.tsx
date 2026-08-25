"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { REASON_MAX, REASON_MIN } from "./rework";

/**
 * Aparece quando alguem reprova uma entrega. O texto vai para o historico e e
 * o que permite contar retrabalho depois — por isso nao tem "pular".
 */
export function ReasonPrompt({
  itemTitle,
  stageName,
  pending,
  onCancel,
  onConfirm,
}: {
  itemTitle: string;
  stageName: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const ready = reason.trim().length >= REASON_MIN;

  return (
    <Modal
      label="Motivo"
      title={`Voltar para ${stageName}`}
      subtitle={itemTitle}
      width={520}
      onClose={onCancel}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready || pending) return;
          onConfirm(reason.trim());
        }}
        className="flex flex-col gap-3 px-5 py-4"
      >
        <label className="flex flex-col gap-1.5">
          <span className="label-mono">O que precisa ser ajustado</span>
          <textarea
            autoFocus
            required
            rows={4}
            value={reason}
            maxLength={REASON_MAX}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Seja específico: quem for refazer só tem isto para trabalhar."
            className="w-full resize-y rounded-[var(--radius-control)] border border-line bg-surface p-2.5 text-[13.5px] leading-relaxed text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </label>

        <p className="text-[12px] text-faint">
          Fica no histórico da tarefa e aparece para quem for refazer.
        </p>

        <ModalFooter>
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-[var(--radius-control)] px-3 text-sm text-muted transition-colors hover:text-ink"
          >
            Cancelar
          </button>
          <Button type="submit" size="md" disabled={!ready || pending}>
            {pending ? "Voltando…" : "Voltar tarefa"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
