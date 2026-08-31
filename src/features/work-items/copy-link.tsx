"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { caminhoDaTarefa, codigoDaTarefa } from "@/lib/task-code";

/**
 * O codigo da tarefa, e um clique para levar o link dela.
 *
 * Ate aqui, mandar uma tarefa para alguem era copiar a barra de enderecos com
 * trinta e seis caracteres de UUID no meio — e, pior, esse endereco carregava
 * junto o filtro e a visualizacao de quem copiou, entao quem abria caia numa
 * tela recortada por outra pessoa. Aqui o link e sempre o mesmo e sempre curto.
 *
 * O codigo fica **a mostra ao lado do botao**, e nao escondido dentro dele:
 * "mkt-123" e para ser falado no corredor e escrito no comentario, nao so
 * clicado.
 *
 * A origem vem de `window.location` porque so o navegador sabe por qual
 * endereco a pessoa chegou — em producao, em `localhost` ou pela URL do deploy.
 */
export function CopyLink({ numero }: { numero: number }) {
  const [copiado, setCopiado] = useState(false);

  const codigo = codigoDaTarefa(numero);

  /*
   * `span` e nao `div`: isto mora dentro do `<p>` da empresa e do projeto, e
   * bloco dentro de paragrafo e HTML invalido — o React remonta a arvore no
   * cliente e o console enche de erro de hidratacao.
   */
  return (
    <span className="inline-flex items-center gap-1.5">
      <code className="font-mono text-[11.5px] text-faint">{codigo}</code>

      <button
        type="button"
        aria-label={`Copiar link da ${codigo}`}
        title={copiado ? "Link copiado" : "Copiar link"}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(
              `${window.location.origin}${caminhoDaTarefa(numero)}`,
            );
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1600);
          } catch {
            /*
             * Sem permissao de area de transferencia — navegador antigo, ou
             * pagina fora de HTTPS. O codigo continua na tela ao lado, que e o
             * suficiente para a pessoa achar a tarefa pela busca.
             */
            setCopiado(false);
          }
        }}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-[var(--radius-control)] transition-colors",
          copiado ? "text-success" : "text-faint hover:bg-hover hover:text-ink",
        )}
      >
        {copiado ? <Check size={13} strokeWidth={2.5} /> : <Link2 size={13} strokeWidth={1.75} />}
      </button>
    </span>
  );
}
