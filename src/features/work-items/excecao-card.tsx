"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Lock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  JUSTIFICATIVA_MAX,
  JUSTIFICATIVA_MIN,
  MOTIVO_LIVRE,
  MOTIVOS,
  rotuloMotivo,
} from "@/lib/excecao";
import { REASON_MAX, REASON_MIN } from "./rework";
import {
  cancelarPedidoExcecao,
  pedirExcecao,
  recusarExcecao,
  setReviewExempt,
  type ActionState,
} from "./actions";

export type ExcecaoData = {
  marcada: boolean;
  motivo: string | null;
  justificativa: string | null;
  saida: string | null;
  marcadaEm: Date | null;
  marcadaPor: string | null;

  pedidaEm: Date | null;
  pedidaPor: string | null;
  pedidaPorMim: boolean;

  recusadaEm: Date | null;
  recusadaPor: string | null;
  recusaMotivo: string | null;

  /** Vem do servidor: só a liderança marca, aprova e recusa. */
  podeDecidir: boolean;
  /** Vem do servidor: pedir vale enquanto a peça não entrou na esteira. */
  podePedir: boolean;
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

const CAIXA = "w-full rounded-[var(--radius-control)] border border-line bg-surface text-[13px] text-ink focus:border-accent focus:outline-none";

/**
 * A exceção declarada, na tela da entrega.
 *
 * Três telas em uma, porque são três papéis diante do mesmo campo:
 *
 *   - **quem produz** escolhe o motivo e *pede*. Não marca. Marcar a própria
 *     exceção é um poder que se auto-concede, e este campo mede justamente se
 *     o time achou um atalho — quem é medido não pode ser quem decide.
 *   - **quem lidera** vê o pedido com o motivo escrito e aprova ou recusa. E
 *     pode marcar direto, sem pedido, em qualquer etapa.
 *   - **os dois** veem o resultado: motivo, autor e data, para sempre.
 *
 * Nada aqui nasce marcado, e nada herda de template, duplicação, importação ou
 * automação — exceção herdada é exceção que ninguém decidiu.
 */
export function ExcecaoCard({ itemId, dados }: { itemId: string; dados: ExcecaoData }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [formulario, setFormulario] = useState(false);
  const [motivo, setMotivo] = useState<string>(dados.motivo ?? "");
  const [texto, setTexto] = useState(dados.justificativa ?? "");

  const [recusando, setRecusando] = useState(false);
  const [recusa, setRecusa] = useState("");

  // Subtarefa não é peça: quem atravessa a esteira é a tarefa-mãe.
  if (dados.ehSubtarefa) return null;

  const pendente = dados.pedidaEm !== null && !dados.marcada && dados.recusadaEm === null;
  const precisaTexto = motivo === MOTIVO_LIVRE;
  const pronto = motivo !== "" && (!precisaTexto || texto.trim().length >= JUSTIFICATIVA_MIN);

  function rodar(acao: () => Promise<ActionState>) {
    setErro(null);
    start(async () => {
      const r = await acao();
      if (r.error) setErro(r.error);
      else {
        setFormulario(false);
        setRecusando(false);
        setRecusa("");
        router.refresh();
      }
    });
  }

  /** O cabeçalho muda com o estado; o resto do cartão é o mesmo. */
  const titulo = dados.marcada
    ? "Esta peça não precisa de revisão automática"
    : pendente
      ? "Exceção pedida, esperando a liderança"
      : "Esta peça não precisa de revisão automática?";

  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] border p-3.5",
        dados.marcada
          ? "border-line-strong bg-sunk"
          : pendente
            ? "border-brand-line bg-brand-soft"
            : "border-dashed border-line",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[4px] border",
            dados.marcada
              ? "border-brand-line bg-brand text-brand-fg"
              : "border-line-strong text-faint",
          )}
        >
          {dados.marcada ? (
            <Check size={11} strokeWidth={3} />
          ) : pendente ? (
            <Clock size={10} strokeWidth={2.5} />
          ) : null}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] leading-snug text-ink">{titulo}</p>

          {dados.marcada ? (
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              {rotuloMotivo(dados.motivo)}
              {dados.pedidaPor && dados.pedidaPor !== dados.marcadaPor
                ? ` · pedida por ${dados.pedidaPor}, aprovada por ${dados.marcadaPor ?? "—"}`
                : dados.marcadaPor
                  ? ` · ${dados.marcadaPor}`
                  : ""}
              {dados.marcadaEm ? ` · ${quando(dados.marcadaEm)}` : ""}
              {dados.saida === "aprovacao_excecao" ? " · aprovação de exceção" : ""}
            </p>
          ) : pendente ? (
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              {rotuloMotivo(dados.motivo)}
              {dados.pedidaPor ? ` · ${dados.pedidaPor}` : ""}
              {dados.pedidaEm ? ` · ${quando(dados.pedidaEm)}` : ""}
            </p>
          ) : (
            <p className="mt-1 text-[11.5px] leading-relaxed text-faint">
              Marcada, ela vai de Em andamento direto para Aprovação — nunca para Publicar. A
              aprovação de uma pessoa continua valendo.
            </p>
          )}

          {(dados.marcada || pendente) && dados.justificativa ? (
            <p className="mt-1.5 whitespace-pre-line rounded-[var(--radius-control)] border border-line bg-surface px-2.5 py-2 text-[12.5px] leading-relaxed text-ink">
              {dados.justificativa}
            </p>
          ) : null}

          {/*
            A recusa fica na tela, com o motivo. Recusa sem motivo é a mesma
            coisa que silêncio, e silêncio ensina o time a parar de pedir — que
            não é o mesmo que parar de precisar.
          */}
          {dados.recusadaEm && !dados.marcada ? (
            <div className="mt-1.5 rounded-[var(--radius-control)] border border-warning/35 bg-warning-soft px-2.5 py-2">
              <p className="text-[11.5px] text-warning">
                Pedido recusado{dados.recusadaPor ? ` por ${dados.recusadaPor}` : ""} ·{" "}
                {quando(dados.recusadaEm)}
              </p>
              <p className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-ink">
                {dados.recusaMotivo}
              </p>
            </div>
          ) : null}

          {!dados.marcada && !pendente && !dados.podeDecidir && !dados.podePedir ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-faint">
              <Lock size={11} className="mt-[2px] shrink-0" />
              <span>
                A peça já entrou na esteira. A partir daqui, quem marca a exceção é a liderança.
              </span>
            </p>
          ) : null}

          {/* ------------------------------------------------------ botões */}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {dados.marcada && dados.podeDecidir ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => rodar(() => setReviewExempt(itemId, { marcado: false }))}
                className="h-8 rounded-[var(--radius-control)] border border-line px-2.5 text-[13px] text-muted transition-colors hover:text-ink"
              >
                Desmarcar e mandar para a esteira
              </button>
            ) : null}

            {pendente && dados.podeDecidir && !recusando ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => rodar(() => setReviewExempt(itemId, { marcado: true }))}
                  className="h-8 rounded-[var(--radius-control)] border border-brand-line bg-brand px-3 text-[13px] font-medium text-brand-fg"
                >
                  {busy ? "Aprovando…" : "Aprovar a exceção"}
                </button>
                <button
                  type="button"
                  onClick={() => setRecusando(true)}
                  className="h-8 rounded-[var(--radius-control)] border border-line px-2.5 text-[13px] text-muted transition-colors hover:text-ink"
                >
                  Recusar
                </button>
              </>
            ) : null}

            {pendente && dados.pedidaPorMim ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => rodar(() => cancelarPedidoExcecao(itemId))}
                className="h-8 rounded-[var(--radius-control)] px-2 text-[13px] text-muted transition-colors hover:text-ink"
              >
                Cancelar meu pedido
              </button>
            ) : null}

            {!dados.marcada && !pendente && !formulario && (dados.podeDecidir || dados.podePedir) ? (
              <button
                type="button"
                onClick={() => setFormulario(true)}
                className="h-8 rounded-[var(--radius-control)] border border-line px-2.5 text-[13px] text-ink transition-colors hover:bg-hover"
              >
                {dados.podeDecidir ? "Marcar exceção" : "Pedir exceção"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------- pedir ou marcar */}

      {formulario && !dados.marcada && !pendente ? (
        <div className="mt-3 flex flex-col gap-2.5 border-t border-line pt-3">
          <label className="flex flex-col gap-1.5">
            <span className="label-mono">Motivo</span>
            <select
              autoFocus
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className={cn(CAIXA, "h-8 px-2")}
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
                className={cn(CAIXA, "resize-y p-2.5 leading-relaxed placeholder:text-faint")}
              />
            </label>
          ) : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!pronto || busy}
              onClick={() =>
                rodar(() =>
                  dados.podeDecidir
                    ? setReviewExempt(itemId, { marcado: true, motivo, justificativa: texto })
                    : pedirExcecao(itemId, { motivo, justificativa: texto }),
                )
              }
              className="h-8 rounded-[var(--radius-control)] border border-brand-line bg-brand px-3 text-[13px] font-medium text-brand-fg transition-opacity disabled:opacity-40"
            >
              {busy ? "Gravando…" : dados.podeDecidir ? "Marcar exceção" : "Pedir exceção"}
            </button>
            <button
              type="button"
              onClick={() => setFormulario(false)}
              className="h-8 rounded-[var(--radius-control)] px-2 text-[13px] text-muted transition-colors hover:text-ink"
            >
              Cancelar
            </button>
          </div>

          <p className="text-[11.5px] leading-relaxed text-faint">
            {dados.podeDecidir
              ? "Fica gravado com seu nome e entra no relatório mensal de exceções."
              : "Fica gravado com seu nome. A liderança decide, e você vê a resposta aqui."}
          </p>
        </div>
      ) : null}

      {/* ------------------------------------------------------- a recusa */}

      {recusando ? (
        <div className="mt-3 flex flex-col gap-2.5 border-t border-line pt-3">
          <label className="flex flex-col gap-1.5">
            <span className="label-mono">Por que o pedido não vale</span>
            <textarea
              autoFocus
              rows={3}
              value={recusa}
              maxLength={REASON_MAX}
              onChange={(e) => setRecusa(e.target.value)}
              placeholder="Quem pediu só tem isto para entender a decisão."
              className={cn(CAIXA, "resize-y p-2.5 leading-relaxed placeholder:text-faint")}
            />
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={recusa.trim().length < REASON_MIN || busy}
              onClick={() => rodar(() => recusarExcecao(itemId, recusa))}
              className="flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-3 text-[13px] text-ink transition-opacity hover:bg-hover disabled:opacity-40"
            >
              <X size={13} />
              {busy ? "Recusando…" : "Recusar o pedido"}
            </button>
            <button
              type="button"
              onClick={() => setRecusando(false)}
              className="h-8 rounded-[var(--radius-control)] px-2 text-[13px] text-muted transition-colors hover:text-ink"
            >
              Voltar
            </button>
          </div>
        </div>
      ) : null}

      {erro ? <p className="mt-2 text-[12.5px] text-danger">{erro}</p> : null}
    </section>
  );
}
