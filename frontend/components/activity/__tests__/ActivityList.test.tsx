import { render, screen } from "@testing-library/react";
import { ActivityList } from "../ActivityList";
import type { ActivityItem } from "../../../lib/vault/data";

const items: ActivityItem[] = [
  { id: 2, cat: "auto", kind: "rebalanced", detail: "Switched to DeFindex · 8.59% APY", when: "3h ago" },
  { id: 1, cat: "auto", kind: "proposed-exit", detail: "Proposed safe exit from EURC pool", when: "6h ago", review: true },
];

test("renders activity details and a Review affordance for review items", () => {
  render(<ActivityList items={items} onReview={() => {}} />);
  expect(screen.getByText("Switched to DeFindex · 8.59% APY")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Review" })).toBeInTheDocument();
});
