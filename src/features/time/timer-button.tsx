"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { startTimer, stopTimer } from "./actions";

/**
 * Iniciar e parar direto da linha, sem abrir a tarefa. Se outro timer estiver
 * rodando, o servidor para ele antes — trocar de tarefa é um clique.
 */
export function TimerButton({
  workItemId,
  isRunning,
  size = 16,
}: {
  workItemId: string;
  isRunning: boolean;
  size?: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    start(async () => {
      const result = isRunning ? await stopTimer() : await startTimer(workItemId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-label={isRunning ? "Parar cronômetro" : "Iniciar cronômetro"}
      title={error ?? (isRunning ? "Parar" : "Iniciar cronômetro")}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full transition-colors duration-150",
        isRunning ? "text-accent" : "text-faint hover:text-accent",
        error && "text-danger",
        pending && "opacity-50",
      )}
      style={{ width: size + 6, height: size + 6 }}
    >
      {isRunning ? (
        <Square size={size - 5} strokeWidth={2.5} fill="currentColor" />
      ) : (
        <Play size={size - 3} strokeWidth={2} fill="currentColor" />
      )}
    </button>
  );
}
