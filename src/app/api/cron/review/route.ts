import { NextResponse, type NextRequest } from "next/server";
import { drainReviewQueue } from "@/features/review/drain";

/**
 * O cron que processa a fila do revisor.
 *
 * A Vercel chama esta rota no horário do `vercel.json` mandando
 * `Authorization: Bearer $CRON_SECRET`. Sem o segredo configurado a rota
 * **recusa** em vez de abrir: uma rota de processamento aberta na internet é
 * um jeito barato de alguém queimar a cota de IA da empresa.
 *
 * Cron cobre o MVP inteiro. Fila de verdade — cobrança por WhatsApp, geração
 * de rotina em lote — é quando entra Redis, não antes.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { erro: "CRON_SECRET não configurado. A fila não roda sem ele." },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  try {
    const report = await drainReviewQueue();
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    // O cron falhar não pode passar batido: 500 para a Vercel registrar.
    return NextResponse.json({ ok: false, erro: describe(error) }, { status: 500 });
  }
}

/**
 * O driver embrulha o erro do Postgres: a mensagem de fora só diz "Failed
 * query" e a causa real fica em `cause`. Sem desembrulhar, o log do cron não
 * serve para nada — e cron que falha calado é o pior tipo de falha.
 */
function describe(error: unknown): string {
  const parts: string[] = [];
  let current = error;

  for (let i = 0; i < 5 && current instanceof Error; i++) {
    parts.push(current.message);
    current = (current as Error & { cause?: unknown }).cause;
  }

  return parts.join(" | ") || "Erro desconhecido.";
}
