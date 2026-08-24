import type { CurrentUser } from "@/lib/auth";
import { getItemDetail } from "./queries";
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

  return <DetailPanel item={item} people={people} today={today} />;
}
