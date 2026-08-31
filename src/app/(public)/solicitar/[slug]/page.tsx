import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { brtToday } from "@/lib/date";
import { loadScope } from "@/features/requests/queries";
import { RequestForm } from "@/features/requests/request-form";
import { Logo } from "@/components/logo";

/**
 * O mesmo formulario, recortado numa empresa. Serve para quem quer mandar o
 * link ja apontado — o geral fica em `/solicitar`.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const scope = await loadScope(slug);
  return {
    title: scope?.title ? `Pedir para o marketing · ${scope.title}` : "Pedido de marketing",
    robots: { index: false, follow: false },
  };
}

export default async function CompanyRequestPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const scope = await loadScope(slug);
  if (!scope) notFound();

  return (
    <main className="mx-auto w-full max-w-[680px] px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <Logo className="mb-6 w-[132px]" />
        <p className="label-mono mb-2">{scope.title}</p>
        <h1 className="font-display text-[27px] font-semibold leading-tight text-ink">
          Pedir para o marketing
        </h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
          Preencha o que der. Quanto mais claro o objetivo, menos idas e voltas depois — e mais
          rápido sai.
        </p>
      </header>

      <RequestForm today={brtToday()} data={{ slug, ...scope }} />

      <p className="mt-10 text-center text-[12px] text-faint">
        MKT Hub · Grupo SB
      </p>
    </main>
  );
}
