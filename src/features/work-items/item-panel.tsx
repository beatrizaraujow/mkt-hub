import type { CurrentUser } from "@/lib/auth";
import { getItemDetail, peopleWithLoad } from "./queries";
import { entriesForItem, runningTimer, timeSummary } from "@/features/time/queries";
import { storageConfigured } from "@/lib/storage";
import { DetailPanel } from "./detail-panel";

/**
 * O painel é servido pela própria página, a partir de `?item=<id>`.
 * Se o id não existir ou estiver fora do alcance da pessoa, não renderiza
 * nada — sem mensagem de erro, que revelaria a existência do item.
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
  const item = await getItemDetail(user, id);
  if (!item) return null;

  const [summary, entries, running, people] = await Promise.all([
    timeSummary(id),
    entriesForItem(id),
    runningTimer(user.id),
    peopleWithLoad(user),
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
      meId={user.id}
      today={today}
      summary={summary}
      entries={entries}
      timerRunning={onThis}
      runningSince={onThis || onSubtask ? (running?.startedAt ?? null) : null}
      runningSubtaskId={onSubtask}
      storageOn={storageConfigured()}
      souMaster={user.isMaster}
    />
  );
}
