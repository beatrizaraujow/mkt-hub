"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * O pedido exato que iria para o modelo, copiável.
 *
 * Poder colar isto num lugar qualquer e ler com calma é o que transforma
 * "o parecer veio estranho" em "a regra CAR-03 está mal escrita". Sem essa
 * tela, a única forma de saber o que o modelo recebeu é gastar uma chamada.
 */
export function PromptPreview({ system, briefing }: { system: string; briefing: string }) {
  const [copied, setCopied] = useState(false);
  const full = `${system}\n\n---\n\n${briefing}`;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(full);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // Sem permissão de área de transferência: o texto continua na tela.
            setCopied(false);
          }
        }}
        className="flex w-fit items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-2 py-1 text-[12.5px] text-ink transition-colors hover:bg-hover"
      >
        {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
        {copied ? "Copiado" : "Copiar o pedido inteiro"}
      </button>

      <pre className="max-h-[420px] overflow-auto rounded-[var(--radius-control)] bg-sunk p-3 text-[12px] leading-relaxed text-ink">
        {full}
      </pre>
    </div>
  );
}
