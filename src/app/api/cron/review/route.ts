import { NextResponse, type NextRequest } from "next/server";
import { drainReviewQueue } from "@/features/review/drain";
import { describeError } from "@/lib/errors";

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
    return NextResponse.json({ ok: false, erro: describeError(error) }, { status: 500 });
  }
}
