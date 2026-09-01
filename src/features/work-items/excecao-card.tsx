"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  JUSTIFICATIVA_MAX,
  JUSTIFICATIVA_MIN,
  MOTIVO_LIVRE,
  MOTIVOS,
  rotuloMotivo,
} from "@/lib/excecao";
import { setReviewExempt } from "./actions";

export type ExcecaoData = {
  marcada: boolean;
  motivo: string | null;
  justificativa: string | null;
  saida: string | null;
  marcadaEm: Date | null;
  marcadaPor: string | null;
  /** Vem do servidor: o campo tranca quando a peça entra na esteira. */
  podeMarcar: boolean;
  ehSubtarefa: boolean;
};

function quando(data: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(data);
}

/**
 * A exceção declarada, na tela da entrega.
 *
 * É um campo pequeno com uma consequência grande, e o texto ao redor existe
 * para que ninguém marque por engano achando que está pulando burocracia: a
 * peça marcada continua indo para a aprovação de uma pessoa, e a marcação fica
 * gravada com nome, motivo e data.
 *
 * Nasce sempre desmarcada. Nada aqui herda de template, de duplicação, de
 * importação ou de automação — a exceção é uma decisão, e decisão herdada é
 * decisão que ninguém tomou.
 */
export function ExcecaoCard({ itemId, dados }: { itemId: string; dados: ExcecaoData }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  /** Aberto enquanto a pessoa escolhe o motivo, antes de gravar. */
  const [escolhendo, setEscolhendo] = useState(false);
  const [motivo, setMotivo] = useState<string>(dados.motivo ?? "");
  const [texto, setTexto] = useState(dados.justificativa ?? "");

  // Subtarefa não é peça: quem atravessa a esteira é a tarefa-mãe.
  if (dados.ehSubtarefa) return null;

  const travado = !dados.podeMarcar;
  const precisaTexto = motivo === MOTIVO_LIVRE;
  const pronto = motivo !== "" && (!precisaTexto || texto.trim().length >= JUSTIFICATIVA_MIN);

  function gravar(marcado: boolean) {
    setErro(null);
    start(async () => {
      const r = await setReviewExempt(itemId, {
        marcado,
        motivo: marcado ? motivo : null,
        justificativa: marcado ? texto : null,
      });
      if (r.error) setErro(r.error);
      else {
        setEscolhendo(false);
        router.refresh();
      }
    });
  }

  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] border p-3.5",
        dados.marcada ? "border-line-strong bg-sunk" : "border-dashed border-line",
      )}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          disabled={busy || travado}
          aria-pressed={dados.marcada}
          onClick={() => {
            if (dados.marcada) gravar(false);
            else setEscolhendo((aberto) => !aberto);
          }}
          className={cn(
            "mt-0.5 flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[4px] border transition-colors",
            dados.marcada
              ? "border-brand-line bg-brand text-brand-fg"
              : "border-line-strong text-transparent",
            travado ? "cursor-not-allowed opacity-60" : "hover:border-accent",
          )}
        >
          <Check size={11} strokeWidth={3} />
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] leading-snug text-ink">
            Esta peça não precisa de revisão automática
          </p>

          {dados.marcada ? (
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              {rotuloMotivo(dados.motivo)}
              {dados.marcadaPor ? ` · ${dados.marcadaPor}` : ""}
              {dados.marcadaEm ? ` · ${quando(dados.marcadaEm)}` : ""}
              {dados.saida === "aprovacao_excecao" ? " · aprovação de exceção" : ""}
            </p>
          ) : (
            <p className="mt-1 text-[11.5px] leading-relaxed text-faint">
              Ela vai de Em andamento direto para Aprovação — nunca para Publicar. A aprovação de
              uma pessoa continua valendo.
            </p>
          )}

          {dados.marcada && dados.justificativa ? (
            <p className="mt-1.5 whitespace-pre-line rounded-[var(--radius-control)] border border-line bg-surface px-2.5 py-2 text-[12.5px] leading-relaxed text-ink">
              {dados.justificativa}
            </p>
          ) : null}

          {travado ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-faint">
              <Lock size={11} className="mt-[2px] shrink-0" />
              <span>
                A peça já entrou na esteira e o campo está trancado. A partir daqui, só a liderança
                marca ou desmarca.
              </span>
            </p>
          ) : null}
        </div>
      </div>

      {escolhendo && !dados.marcada ? (
        <div className="mt-3 flex flex-col gap-2.5 border-t border-line pt-3">
          <label className="flex flex-col gap-1.5">
            <span className="label-mono">Motivo</span>
            <select
              autoFocus
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="h-8 w-full rounded-[var(--radius-control)] border border-line bg-surface px-2 text-[13px] text-ink focus:border-accent focus:outline-none"
            >
              <option value="">Escolha…</option>
              {MOTIVOS.map((opcao) => (
                <option key={opcao.value} value={opcao.value}>
                  {opcao.label}
                </option>
              ))}
            </select>
          </label>

          {precisaTexto ? (
            <label className="flex flex-col gap-1.5">
              <span className="label-mono">Justificativa</span>
              <textarea
                rows={3}
                value={texto}
                maxLength={JUSTIFICATIVA_MAX}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Escreva por quê. Este texto aparece no relatório mensal."
                className="w-full resize-y rounded-[var(--radius-control)] border border-line bg-surface p-2.5 text-[13px] leading-relaxed text-ink placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </label>
          ) : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!pronto || busy}
              onClick={() => gravar(true)}
              className="h-8 rounded-[var(--radius-control)] border border-brand-line bg-brand px-3 text-[13px] font-medium text-brand-fg transition-opacity disabled:opacity-40"
            >
              {busy ? "Gravando…" : "Marcar exceção"}
            </button>
            <button
              type="button"
              onClick={() => setEscolhendo(false)}
              className="h-8 rounded-[var(--radius-control)] px-2 text-[13px] text-muted transition-colors hover:text-ink"
            >
              Cancelar
            </button>
          </div>

          <p className="text-[11.5px] leading-relaxed text-faint">
            Fica gravado com seu nome e entra no relatório mensal de exceções.
          </p>
        </div>
      ) : null}

      {erro ? <p className="mt-2 text-[12.5px] text-danger">{erro}</p> : null}
    </section>
  );
}
