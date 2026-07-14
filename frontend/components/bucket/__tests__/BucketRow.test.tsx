import { render, screen } from "@testing-library/react";
import { BucketRow } from "../BucketRow";
import type { BucketView } from "../../../hooks/useBuckets";

const bucket: BucketView = {
  currency: "USD", name: "USD bucket", venue: "DeFindex", tags: ["DeFindex", "Vault"], apy: 8.59,
  shares: 1n, value: 10_243_000_000n, valueUsd: 1024.3, frozen: false,
};

test("renders bucket name, tags, formatted value and APY, no risk label", () => {
  render(<BucketRow bucket={bucket} first />);
  expect(screen.getByText("USD bucket")).toBeInTheDocument();
  expect(screen.getByText("DeFindex")).toBeInTheDocument();
  expect(screen.getByText("$1,024.30")).toBeInTheDocument();
  expect(screen.getByText("8.59% APY")).toBeInTheDocument();
  expect(screen.queryByText(/safe|watch|conservative|balanced|risk/i)).not.toBeInTheDocument();
});
