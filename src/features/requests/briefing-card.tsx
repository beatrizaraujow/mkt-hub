import { Mail, Phone } from "lucide-react";
import { isRequestType } from "@/lib/catalog";
import { QUESTIONS } from "@/lib/request-questions";
import type { RequestInfo } from "@/features/work-items/queries";

/**
 * Devolve as respostas com o rotulo do formulario e na ordem em que foram
 * perguntadas. O jsonb do Postgres nao guarda a ordem das chaves — sem isso,
 * o briefing chega embaralhado e nao se le na mesma sequencia em que foi
 * escrito. Resposta de pergunta que nao existe mais vai para o fim, com a
 * chave crua: some do formulario, nao do que ja foi respondido.
 */
function ordered(request: RequestInfo) {
  const answers = new Map(request.briefing);
  const rows: Array<{ key: string; label: string; value: string }> = [];

  if (request.type && isRequestType(request.type)) {
    for (const question of QUESTIONS[request.type]) {
      const value = answers.get(question.key);
      if (value) {
        rows.push({ key: question.key, label: question.label, value });
        answers.delete(question.key);
      }
    }
  }

  for (const [key, value] of answers) rows.push({ key, label: key, value });
  return rows;
}

/** Quebra o texto em linhas e transforma cada URL num link clicavel. */
function Links({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      {text.split(/\r?\n/).map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        const isUrl = /^https?:\/\/\S+$/.test(trimmed);

        return isUrl ? (
          <a
            key={index}
            href={trimmed}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-accent hover:underline"
          >
            {trimmed}
          </a>
        ) : (
          <span key={index}>{trimmed}</span>
        );
      })}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 py-1.5 sm:grid-cols-[132px_1fr] sm:gap-3">
      <span className="text-[12px] text-faint sm:pt-[1px]">{label}</span>
      <div className="min-w-0 whitespace-pre-line text-[13px] leading-relaxed text-ink">
        {children}
      </div>
    </div>
  );
}

/**
 * O que a pessoa de fora escreveu, do jeito que escreveu. Nao e editavel:
 * se o time mudar o pedido aqui, some a prova do que foi combinado — para
 * ajustar existe a descricao e a conversa.
 */
export function BriefingCard({ request }: { request: RequestInfo }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-sunk p-4">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="label-mono">Pedido</h3>
        {request.type ? (
          <span className="rounded-[6px] bg-surface px-1.5 py-0.5 text-[11.5px] text-muted">
            {request.type}
          </span>
        ) : null}
      </div>

      <p className="text-[13.5px] font-medium text-ink">{request.name}</p>

      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-faint">
        {request.email ? (
          <a
            href={`mailto:${request.email}`}
            className="inline-flex items-center gap-1 hover:text-accent"
          >
            <Mail size={11.5} />
            {request.email}
          </a>
        ) : null}
        {request.phone ? (
          <span className="inline-flex items-center gap-1">
            <Phone size={11.5} />
            {request.phone}
          </span>
        ) : null}
      </div>

      {(request.objective || request.briefing.length > 0 || request.references || request.notes) && (
        <div className="mt-3 divide-y divide-line border-t border-line pt-1">
          {request.objective ? <Row label="Objetivo">{request.objective}</Row> : null}

          {ordered(request).map((row) => (
            <Row key={row.key} label={row.label}>
              {row.value}
            </Row>
          ))}

          {request.references ? (
            <Row label="Referências">
              <Links text={request.references} />
            </Row>
          ) : null}

          {request.notes ? <Row label="Observações">{request.notes}</Row> : null}
        </div>
      )}
    </section>
  );
}
