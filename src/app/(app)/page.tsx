import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { brtToday, formatDuration } from "@/lib/date";
import { secondsTrackedToday, todayBoard, type WorkItemRow } from "@/features/work-items/queries";
import { ItemRow } from "@/features/work-items/item-row";
import { QuickCreate } from "@/features/work-items/quick-create";
import { quickCreateOptions } from "@/features/work-items/queries";
import { ItemPanel } from "@/features/work-items/item-panel";
import { closeStaleTimers, runningTimer, unconfirmedEntries } from "@/features/time/queries";
import { ConfirmBanner } from "@/features/time/confirm-banner";

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
  count,
  tone = "default",
  items,
  today,
  empty,
  runningItemId,
}: {
  title: string;
  count: number;
  tone?: "default" | "danger";
  items: WorkItemRow[];
  today: string;
  empty?: string;
  runningItemId: string | null;
}) {
  if (items.length === 0 && !empty) return null;

  return (
    <section>
      <h2 className="label-mono mb-2 flex items-center gap-2">
        <span className={tone === "danger" ? "!text-danger" : undefined}>{title}</span>
        {count > 0 && <span className="tnum opacity-70">{count}</span>}
      </h2>

      {items.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-5 text-[13.5px] text-faint">
          {empty}
        </p>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          {items.map((item) => (
            <ItemRow key={item.id} item={item} today={today} runningItemId={runningItemId} />
          ))}
        </div>
      )}
    </section>
  );
}

export default async function HojePage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const { hour, label } = brtNow();
  const today = brtToday();
  const firstName = user.name.split(" ")[0];

  // Fecha o que ficou aberto ANTES de perguntar o que precisa de confirmação.
  // Em paralelo, a primeira carga do dia perderia o aviso.
  await closeStaleTimers(user.id);

  const [board, seconds, options, running, pendentes] = await Promise.all([
    todayBoard(user),
    secondsTrackedToday(user.id),
    quickCreateOptions(user),
    runningTimer(user.id),
    unconfirmedEntries(user.id),
  ]);
  const runningItemId = running?.workItemId ?? null;

  const nothingAtAll =
    board.atrasado.length + board.hoje.length + board.depois.length + board.semPrazo.length === 0;

  return (
    <>
      <PageHeader
        title={`${greeting(hour)}, ${firstName}`}
        description={label}
        actions={
          <QuickCreate
            options={{
              companies: options.companies,
              projects: options.projects,
              people: options.people,
            }}
          />
        }
      />

      <ConfirmBanner entries={pendentes} />

      <div className="grid gap-8 px-5 py-6 md:px-7 lg:grid-cols-[minmax(0,1fr)_216px]">
        <div className="flex flex-col gap-7">
          <Block
            title="Atrasado"
            tone="danger"
            count={board.atrasado.length}
            items={board.atrasado}
            today={today}
            runningItemId={runningItemId}
          />

          <Block
            title="Hoje"
            count={board.hoje.length}
            items={board.hoje}
            today={today}
            empty={
              nothingAtAll
                ? "Nada na sua fila. Pressione C para criar a primeira tarefa."
                : "Nada com prazo para hoje."
            }
            runningItemId={runningItemId}
          />

          <Block
            title="Próximos 7 dias"
            count={board.depois.length}
            items={board.depois}
            today={today}
            runningItemId={runningItemId}
          />

          <Block
            title="Sem prazo"
            count={board.semPrazo.length}
            items={board.semPrazo}
            today={today}
            runningItemId={runningItemId}
          />
        </div>

        <aside className="flex flex-row flex-wrap gap-6 lg:flex-col lg:border-l lg:border-line lg:pl-6">
          <div>
            <p className="label-mono mb-1">Horas hoje</p>
            <p className="tnum font-display text-[26px] font-semibold text-ink">
              {formatDuration(seconds)}
            </p>
          </div>
          <div>
            <p className="label-mono mb-1">Na sua fila</p>
            <p className="tnum font-display text-[26px] font-semibold text-ink">
              {board.atrasado.length + board.hoje.length + board.depois.length + board.semPrazo.length}
            </p>
          </div>
          <div>
            <p className="label-mono mb-1">Meta da semana</p>
            <p className="text-[13.5px] text-faint">Entra na V1.5</p>
          </div>
        </aside>
      </div>

      {params.item ? (
        <ItemPanel user={user} id={params.item} today={today} />
      ) : null}
    </>
  );
}
