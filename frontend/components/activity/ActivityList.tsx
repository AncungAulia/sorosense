import { ActivityRow } from "./ActivityRow";
import type { ActivityItem } from "../../lib/vault/data";

export function ActivityList({ items, onReview }: { items: ActivityItem[]; onReview?: () => void }) {
  return <div>{items.map((item, i) => <ActivityRow key={item.id} item={item} first={i === 0} onReview={onReview} />)}</div>;
}
