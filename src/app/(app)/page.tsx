import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";

function greeting(hour: number) {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

/** Tudo no sistema calcula o dia em BRT, nunca em UTC. */
function brtNow() {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    hour: Number(get("hour")),
    label: `${get("weekday")}, ${get("day")} de ${get("month")}`,
  };
}

function Block({
  title,
  tone = "default",
  children,
}: {
  title: string;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2
        className={
          tone === "danger"
            ? "label-mono mb-2 !text-danger"
            : "label-mono mb-2"
        }
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Nothing({ text }: { text: string }) {
  return (
    <p className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-5 text-[13.5px] text-faint">
      {text}
    </p>
  );
}

export default async function HojePage() {
  const user = await requireUser();
  const { hour, label } = brtNow();
  const firstName = user.name.split(" ")[0];

  return (
    <>
      <PageHeader title={`${greeting(hour)}, ${firstName}`} description={label} />

      <div className="grid gap-8 px-5 py-6 md:px-7 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="flex flex-col gap-7">
          <Block title="Hoje">
            <Nothing text="Nada para hoje. Quando o módulo de tarefas entrar, a sua fila aparece aqui." />
          </Block>

          <Block title="Depois">
            <Nothing text="Nenhum prazo próximo." />
          </Block>
        </div>

        <aside className="flex flex-col gap-4 lg:border-l lg:border-line lg:pl-6">
          <div>
            <p className="label-mono mb-1">Horas hoje</p>
            <p className="tnum font-display text-[26px] font-semibold text-ink">0h00</p>
          </div>
          <div>
            <p className="label-mono mb-1">Meta da semana</p>
            <p className="text-[13.5px] text-faint">Entra na V1.5</p>
          </div>
          <div>
            <p className="label-mono mb-1">Coins</p>
            <p className="text-[13.5px] text-faint">Entra na V1.5</p>
          </div>
        </aside>
      </div>
    </>
  );
}
