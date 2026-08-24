import type { CurrentUser } from "@/lib/auth";
import { getItemDetail } from "./queries";
import { entriesForItem, runningTimer, timeSummary } from "@/features/time/queries";
import { DetailPanel } from "./detail-panel";

/**
 * O painel é servido pela própria página, a partir de `?item=<id>`.
 * Se o id não existir ou estiver fora do alcance da pessoa, não renderiza
 * nada — sem mensagem de erro, que revelaria a existência do item.
 */
export async function ItemPanel({
  user,
  id,
  people,
  today,
}: {
  user: CurrentUser;
  id: string;
  people: Array<{ id: string; name: string }>;
  today: string;
}) {
  const item = await getItemDetail(user, id);
  if (!item) return null;

  const [summary, entries, running] = await Promise.all([
    timeSummary(id),
    entriesForItem(id),
    runningTimer(user.id),
  ]);

  const onThis = running?.workItemId === id;
  const onSubtask =
    running?.workItemId && item.subtasks.some((s) => s.id === running.workItemId)
      ? running.workItemId
      : null;

  return (
    <DetailPanel
      item={item}
      people={people}
      today={today}
      summary={summary}
      entries={entries}
      timerRunning={onThis}
      runningSince={onThis || onSubtask ? (running?.startedAt ?? null) : null}
      runningSubtaskId={onSubtask}
    />
  );
}
