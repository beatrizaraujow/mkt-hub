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
export function RequestReview({ workItemId }: { workItemId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="subtle"
        disabled={pending}
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

      {message?.error && (
        <span role="alert" className="text-[12.5px] text-danger">
          {message.error}
        </span>
      )}
      {message?.ok && <span className="text-[12.5px] text-muted">{message.ok}</span>}
    </div>
  );
}
