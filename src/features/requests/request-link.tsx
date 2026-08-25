"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

/**
 * O link do formulario publico daquela empresa, para o time mandar a quem
 * pede. Sem isso o formulario existe e ninguem sabe o endereco.
 */
export function RequestLink({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const path = `/solicitar/${slug}`;

  async function copy() {
    // A URL completa so existe no navegador; o servidor nao sabe o dominio.
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-ink">Link para pedir demanda</p>
        <p className="truncate text-[12px] text-faint">
          Mande para quem é de fora do time. Não precisa de login.
        </p>
      </div>

      <code className="hidden truncate rounded-[6px] bg-sunk px-2 py-1 font-mono text-[12px] text-muted lg:block">
        {path}
      </code>

      <button
        type="button"
        onClick={copy}
        className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-2.5 text-[12.5px] text-muted transition-colors hover:border-line-strong hover:text-ink"
      >
        {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
        {copied ? "Copiado" : "Copiar"}
      </button>

      <a
        href={path}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Abrir formulário"
        className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] border border-line text-muted transition-colors hover:border-line-strong hover:text-ink"
      >
        <ExternalLink size={13} />
      </a>
    </div>
  );
}
