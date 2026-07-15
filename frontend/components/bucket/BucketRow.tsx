import { Chip, CoinBadge } from "../ui";
import { formatCurrency } from "../../lib/vault/units";
import type { BucketView } from "../../hooks/useBuckets";

const bucketTitle = (currency: BucketView["currency"]) => `${currency} Bucket`;

export function BucketRow({ bucket, first, divider = true }: { bucket: BucketView; first: boolean; divider?: boolean }) {
  return (
    <div className={`flex items-center gap-[13px] py-3.5 ${first || !divider ? "" : "border-t border-line"}`}>
      <CoinBadge currency={bucket.currency} size={40} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{bucketTitle(bucket.currency)}</div>
        <div className="mt-[5px] flex flex-wrap gap-1.5">
          <Chip className="h-[22px] px-[9px] text-[11.5px]">{bucket.venue}</Chip>
        </div>
      </div>
      <div className="text-right">
        <div className="font-semibold [font-variant-numeric:tabular-nums]">{formatCurrency(bucket.value, bucket.currency)}</div>
        <div className="text-xs font-semibold text-pos">{bucket.apy.toFixed(2)}% APY</div>
      </div>
    </div>
  );
}
