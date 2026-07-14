import { ActivityRow } from "./ActivityRow";
import type { ActivityItem } from "../../lib/vault/data";

export function ActivityList({ items, onReview, reviewed, divider = true }: { items: ActivityItem[]; onReview?: () => void; reviewed?: boolean; divider?: boolean }) {
  return <div>{items.map((item, i) => <ActivityRow key={item.id} item={item} first={i === 0} onReview={onReview} reviewed={reviewed} divider={divider} />)}</div>;
}
