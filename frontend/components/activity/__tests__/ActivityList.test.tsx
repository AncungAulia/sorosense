import { render, screen } from "@testing-library/react";
import { ActivityList } from "../ActivityList";
import type { ActivityItem } from "../../../lib/vault/data";

const items: ActivityItem[] = [
  { id: 2, cat: "auto", kind: "rebalanced", detail: "Switched to DeFindex · 8.59% APY", when: "3h ago" },
  { id: 1, cat: "auto", kind: "proposed-exit", detail: "Proposed safe exit from EURC pool", when: "6h ago", review: true },
];

test("renders activity details and a Review affordance for review items", () => {
  render(<ActivityList items={items} onReview={() => {}} />);
  expect(screen.getByText("Moved to better yield")).toBeInTheDocument();
  expect(screen.getByText("Review needed")).toBeInTheDocument();
  expect(screen.queryByText(/rebalanced|proposed safe exit/i)).toBeNull();
  expect(screen.getByRole("button", { name: "Review" })).toBeInTheDocument();
});

test("shows a dead 'Reviewed' label (no active Review) once the exit is resolved", () => {
  render(<ActivityList items={items} onReview={() => {}} reviewed />);
  expect(screen.getByText("Reviewed")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Review" })).not.toBeInTheDocument();
});

test("renders a designed empty state when empty copy is provided", () => {
  render(<ActivityList items={[]} emptyTitle="No agent activity yet" emptyDescription="Deposit first; automated moves will show here." />);
  expect(screen.getByText("No agent activity yet")).toBeInTheDocument();
  expect(screen.getByText("Deposit first; automated moves will show here.")).toBeInTheDocument();
});
