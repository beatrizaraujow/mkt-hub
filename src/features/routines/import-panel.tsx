"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { importRoutines } from "./actions";
import { marcarRepetidas, parseImport, type PessoaConhecida } from "./import";
import { WEEKDAY_LABELS } from "./week";

/**
 * Colar uma lista de rotinas de uma vez.
 *
 * **Previa antes de escrever, sempre.** A lista colada vem de planilha, e
 * planilha tem coluna trocada, dia escrito de tres jeitos e nome de gente que
 * saiu da empresa. Escrever primeiro e mostrar o estrago depois obriga a
 * desfazer trinta e oito rotinas na mao. Aqui a pessoa ve linha por linha o
 * que vai acontecer, e so entao confirma.
 *
 * A leitura da lista e a mesma funcao pura que o servidor usa. A tela mostra;
 * o servidor decide — ele nunca recebe a lista ja interpretada.
 */

const EXEMPLO = `Instagram\t5 Stories\tdiária\tZion
Instagram\t1 feed\tseg, qua e sex\tZion
TikTok\t1 vídeo\tdias úteis`;

function Dias({ dias }: { dias: number[] }) {
  return (
    <span className="flex gap-0.5">
      {WEEKDAY_LABELS.map((label, index) => (
        <span
          key={label}
          className={cn(
            "w-[22px] rounded-[4px] text-center text-[10.5px] leading-[15px]",
            dias.includes(index) ? "bg-accent-soft text-accent" : "text-faint/50",
          )}
        >
          {label}
        </span>
      ))}
    </span>
  );
}

export function ImportPanel({
  companyId,
  people,
  existing,
  onClose,
}: {
  companyId: string;
  people: PessoaConhecida[];
  existing: Array<{ platform: string; label: string }>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const linhas = useMemo(
    () => (texto.trim() ? marcarRepetidas(parseImport(texto, people), existing) : []),
    [texto, people, existing],
  );

  const novas = linhas.filter((linha) => linha.tipo === "ok" && !linha.repetida).length;
  const repetidas = linhas.filter((linha) => linha.tipo === "ok" && linha.repetida).length;
  const ruins = linhas.filter((linha) => linha.tipo === "erro").length;

  function enviar() {
    setErro(null);
    start(async () => {
      const resultado = await importRoutines(companyId, texto);
      if (resultado.error) {
        setErro(resultado.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="flex flex-col gap-3 border-b border-line px-4 py-3">
      <div>
        <p className="text-[13px] text-ink">Uma rotina por linha, quatro colunas:</p>
        <p className="mt-0.5 text-[12px] text-faint">
          <span className="text-muted">plataforma</span> · <span className="text-muted">o que sai</span> ·{" "}
          <span className="text-muted">dias</span> ·{" "}
          <span className="text-muted">responsável (opcional)</span> — separadas por tabulação,
          ponto-e-vírgula ou <code className="font-mono">·</code>. Colar direto da planilha funciona.
        </p>
        <p className="mt-1 text-[12px] text-faint">
          Os dias aceitam <code className="font-mono">seg, qua e sex</code>,{" "}
          <code className="font-mono">seg a sex</code>, <code className="font-mono">diária</code>,{" "}
          <code className="font-mono">dias úteis</code>. Número não vale: <span className="text-muted">1</span>{" "}
          é segunda num sistema e domingo noutro, e o erro só aparece semanas depois.
        </p>
      </div>

      <textarea
        value={texto}
        onChange={(event) => setTexto(event.target.value)}
        rows={6}
        spellCheck={false}
        placeholder={EXEMPLO}
        className="w-full rounded-[var(--radius-control)] border border-line bg-surface px-2.5 py-2 font-mono text-[12.5px] text-ink transition-colors duration-150 placeholder:text-faint/60 focus:border-accent focus:outline-none"
      />

      {linhas.length > 0 && (
        <div className="overflow-hidden rounded-[var(--radius-control)] border border-line">
          {linhas.map((linha) => (
            <div
              key={linha.numero}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-2.5 py-1.5 text-[12.5px] last:border-b-0"
            >
              <span className="tnum w-5 shrink-0 text-right text-faint">{linha.numero}</span>

              {linha.tipo === "erro" ? (
                <>
                  <span className="min-w-0 flex-1 truncate text-faint line-through">
                    {linha.texto}
                  </span>
                  <span className="text-danger">{linha.motivo}</span>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-ink">
                    <span className="text-muted">{linha.plataforma}</span> · {linha.label}
                  </span>
                  <Dias dias={linha.dias} />
                  <span className="w-[110px] shrink-0 truncate text-faint">
                    {linha.pessoaNome ?? "sem responsável"}
                  </span>
                  <span
                    className={cn(
                      "w-[86px] shrink-0 text-right",
                      linha.repetida ? "text-warning" : "text-success",
                    )}
                  >
                    {linha.repetida === "ja-existe"
                      ? "já existe"
                      : linha.repetida === "na-lista"
                        ? "repetida"
                        : "nova"}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {erro ? (
        <p role="alert" className="text-[13px] text-danger">
          {erro}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={enviar} disabled={pending || novas === 0}>
          {novas === 0 ? "Nada para importar" : `Importar ${novas}`}
        </Button>
        <button
          type="button"
          onClick={onClose}
          className="text-[12.5px] text-faint transition-colors hover:text-ink"
        >
          Cancelar
        </button>

        {linhas.length > 0 && (
          <span className="text-[12px] text-faint">
            {repetidas > 0 && <>{repetidas} já existiam · </>}
            {ruins > 0 && <span className="text-danger">{ruins} com problema · </span>}
            {/*
              O que tem problema fica de fora e o resto entra. Recusar a leva
              inteira por uma vírgula na linha 14 faz a pessoa desistir do
              import e voltar para o formulário um a um.
            */}
            só as marcadas como novas entram
          </span>
        )}
      </div>
    </div>
  );
}
