import type { CurrentUser } from "@/lib/auth";
import { getItemDetail, peopleWithLoad, resolverItemRef } from "./queries";
import { entriesForItem, runningTimer, timeSummary } from "@/features/time/queries";
import { storageConfigured } from "@/lib/storage";
import { DetailPanel } from "./detail-panel";

/**
 * O painel é servido pela própria página, a partir de `?item=`, que aceita o
 * UUID ou o código curto (`mkt-123`) — este é o que uma pessoa manda para a
 * outra.
 *
 * Se a referência não resolver, ou o item estiver fora do alcance da pessoa,
 * não renderiza nada — sem mensagem de erro, que revelaria a existência dele.
 */
export async function ItemPanel({
  user,
  id,
  today,
}: {
  user: CurrentUser;
  id: string;
  today: string;
}) {
  const itemId = await resolverItemRef(user, id);
  if (!itemId) return null;

  const item = await getItemDetail(user, itemId);
  if (!item) return null;

  const [summary, entries, running, people] = await Promise.all([
    timeSummary(itemId),
    entriesForItem(itemId),
    runningTimer(user.id),
    peopleWithLoad(user),
  ]);

  const onThis = running?.workItemId === itemId;
  const onSubtask =
    running?.workItemId && item.subtasks.some((s) => s.id === running.workItemId)
      ? running.workItemId
      : null;

  return (
    <DetailPanel
      item={item}
      people={people}
      meId={user.id}
      today={today}
      summary={summary}
      entries={entries}
      timerRunning={onThis}
      runningSince={onThis || onSubtask ? (running?.startedAt ?? null) : null}
      runningSubtaskId={onSubtask}
      storageOn={storageConfigured()}
    />
  );
}
