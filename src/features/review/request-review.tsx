"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestReview } from "./actions";

/**
 * Enfileira uma revisão e volta na hora. O parecer não chega junto: o cron
 * processa depois, e a tela é recarregada para mostrar o ciclo novo na lista.
 */
export function RequestReview({
  workItemId,
  /**
   * Quando o porteiro barrou, o botão fica travado com o motivo ao lado. Pedir
   * assim gastaria uma rodada para gravar "entrada incompleta" e voltar o mesmo
   * texto que já está na tela. É trava de conveniência, não de segurança: o
   * porteiro roda de novo do lado do servidor, na hora de julgar.
   */
  blocked,
}: {
  workItemId: string;
  blocked?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Button
        size="sm"
        variant="subtle"
        disabled={pending || Boolean(blocked)}
        onClick={() =>
          start(async () => {
            setMessage(null);
            const result = await requestReview(workItemId);

            if (result.error) {
              setMessage({ error: result.error });
              return;
            }

            setMessage({ ok: `Rodada ${result.round} na fila. O cron processa em minutos.` });
            router.refresh();
          })
        }
      >
        <Play size={13} strokeWidth={2} />
        {pending ? "Enfileirando…" : "Pedir revisão"}
      </Button>

      {blocked && <span className="text-[12px] text-muted">{blocked}</span>}

      {message?.error && (
        <span role="alert" className="text-[12.5px] text-danger">
          {message.error}
        </span>
      )}
      {message?.ok && <span className="text-[12.5px] text-muted">{message.ok}</span>}
    </div>
  );
}
