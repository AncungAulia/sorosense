/**
 * Home's value hero toggle (bug fix).
 *
 * The per-bucket toggle must name the **currency bucket** ("USD Bucket"), not the venue/pool. In real
 * mode a `/holdings` row's `name` is the venue (e.g. "USDC SoroSense Pool"); building the toggle from
 * `b.name` leaked that pool name into the pill. Offline `b.name` happened to equal "USD bucket" (from
 * BUCKET_META), which masked the bug — so this test hands the hero a venue-named row on purpose.
 *
 * Capital-B "USD Bucket" matches the BucketRow list on the same screen.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BucketView } from "../../../hooks/useBuckets";
import { TotalHero } from "../TotalHero";

const UNIT = 10_000_000n;

const bucket = (currency: BucketView["currency"], venueName: string): BucketView => ({
  currency,
  name: venueName, // in real mode this is the venue, e.g. "USDC SoroSense Pool"
  venue: venueName,
  tags: [],
  apy: 8.5,
  shares: 1000n * UNIT,
  value: 1000n * UNIT,
  valueUsd: 1000,
  frozen: false,
});

test("the toggle names the currency bucket, not the pool the money sits in", async () => {
  const user = userEvent.setup();
  render(<TotalHero buckets={[bucket("USD", "USDC SoroSense Pool")]} totalUsd={1000} />);

  // Starts on "All buckets".
  expect(screen.getByText("All buckets")).toBeInTheDocument();

  // Cycle to the USD bucket.
  await user.click(screen.getByLabelText("Switch bucket"));

  // Both the label above the number and the toggle pill name the bucket.
  expect(screen.getAllByText("USD Bucket").length).toBeGreaterThan(0);
  expect(screen.queryByText("USDC SoroSense Pool")).toBeNull();
});

test("EUR too: the toggle shows 'EUR Bucket', never the EUR venue name", async () => {
  const user = userEvent.setup();
  render(<TotalHero buckets={[bucket("EUR", "EURC Blend Pool")]} totalUsd={1080} />);

  await user.click(screen.getByLabelText("Switch bucket"));

  expect(screen.getAllByText("EUR Bucket").length).toBeGreaterThan(0);
  expect(screen.queryByText("EURC Blend Pool")).toBeNull();
});
