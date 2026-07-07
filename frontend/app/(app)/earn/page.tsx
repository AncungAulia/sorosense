"use client";
import { Button } from "../../../components/ui";
import { useBuckets } from "../../../hooks/useBuckets";
import { useNav } from "../../../hooks/useNav";
import { UNIT } from "../../../lib/vault/units";
import { getContributions } from "../../../lib/vault/contributions";
import { getFxRateToUsd } from "../../../lib/vault/data";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function EarnPage() {
  const nav = useNav();
  const { loading, buckets, totalUsd } = useBuckets();

  // "Total earned" = current value − net contributions, blended to USD. Immune to
  // deposits/withdrawals; only moves with yield (Coinbase/Nexo/Kraken all headline a
  // lifetime earned figure here, not APY — APY already lives on Home). The full
  // earnings view (per-bucket, growth chart) lands in U16 from the backend cost-basis;
  // the frontend ledger mirrors it.
  const earnedUsd = Math.max(
    0,
    buckets.reduce((sum, b) => {
      const earnedNative = b.value - getContributions(b.currency);
      return sum + (Number(earnedNative) / Number(UNIT)) * getFxRateToUsd(b.currency);
    }, 0),
  );

  if (loading) {
    return <div className="py-[30px] text-center text-sm text-muted">Loading…</div>;
  }

  // Nothing deposited and nothing earned → onboarding, not a dead "$0.00 earned".
  if (buckets.length === 0 && earnedUsd === 0) {
    return (
      <div>
        <div className="py-[30px] text-center">
          <div className="text-[15px] font-medium text-muted">Start earning</div>
          <div className="mx-auto mt-2 max-w-[260px] text-[26px] font-semibold leading-tight tracking-[-.01em]">
            Deposit to start earning
          </div>
          <div className="mt-3 text-[13.5px] text-muted">The agent finds the safest yield · no lockup</div>
        </div>
        <Button onClick={() => nav.forward("/add-funds")}>Deposit</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="py-[30px] text-center">
        <div className="text-[15px] font-medium text-muted">Total earned</div>
        <div className="mt-2 text-[54px] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]">
          {usd(earnedUsd)}
        </div>
        <div className="mt-3 text-[13.5px] text-muted [font-variant-numeric:tabular-nums]">
          on {usd(totalUsd)} balance · no lockup
        </div>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => nav.forward("/add-funds")}>Deposit</Button>
        <Button variant="glass" onClick={() => nav.forward("/withdraw")}>Move to wallet</Button>
      </div>
    </div>
  );
}
