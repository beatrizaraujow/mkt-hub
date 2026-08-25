import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { brtToday } from "@/lib/date";
import { loadScope } from "@/features/requests/queries";
import { RequestForm } from "@/features/requests/request-form";

/**
 * Formulario geral, sem login e sem escolher empresa antes: uma pagina so,
 * um link so para o grupo inteiro. A empresa vira campo dentro do formulario.
 *
 * O caminho com empresa (`/solicitar/seubone`) continua valendo para quem
 * quiser mandar um link ja recortado.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pedir para o marketing",
  robots: { index: false, follow: false },
};

export default async function RequestPage() {
  const scope = await loadScope(null);
  if (!scope) notFound();

  return (
    <main className="mx-auto w-full max-w-[680px] px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <p className="label-mono mb-2">Grupo SB</p>
        <h1 className="font-display text-[27px] font-semibold leading-tight text-ink">
          Pedir para o marketing
        </h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
          Preencha o que der. Quanto mais claro o objetivo, menos idas e voltas depois — e mais
          rápido sai.
        </p>
      </header>

      <RequestForm today={brtToday()} data={{ slug: null, ...scope }} />

      <p className="mt-10 text-center text-[12px] text-faint">MKT Hub · Grupo SB</p>
    </main>
  );
}
