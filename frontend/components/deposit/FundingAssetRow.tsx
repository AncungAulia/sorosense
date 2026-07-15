"use client";

import { CoinBadge } from "../ui";
import type { StablecoinSym } from "../../lib/vault/data";

type FundingAsset = {
  sym: StablecoinSym;
  chains: string[];
};

const COMING_SOON: StablecoinSym[] = ["CETES"];

export function isFundingAssetComingSoon(sym: StablecoinSym): boolean {
  return COMING_SOON.includes(sym);
}

export function FundingAssetRow({
  asset,
  divider = false,
  onPick,
  className = "",
}: {
  asset: FundingAsset;
  divider?: boolean;
  onPick: (sym: StablecoinSym) => void;
  className?: string;
}) {
  const comingSoon = isFundingAssetComingSoon(asset.sym);

  return (
    <button
      type="button"
      disabled={comingSoon}
      aria-disabled={comingSoon}
      onClick={() => {
        if (!comingSoon) onPick(asset.sym);
      }}
      className={[
        "relative flex w-full items-center gap-[13px] py-3.5 text-left transition-colors",
        divider ? "border-t border-line" : "",
        comingSoon ? "cursor-not-allowed" : "hover:bg-[#f4f4f4]",
        className,
      ].join(" ")}
    >
      <div className={comingSoon ? "opacity-45 grayscale" : ""}>
        <CoinBadge token={asset.sym} size={40} />
      </div>
      <div className={["min-w-0 flex-1", comingSoon ? "opacity-50" : ""].join(" ")}>
        <div className="font-semibold">{asset.sym}</div>
        <div className="mt-[5px] flex flex-wrap gap-1.5">
          {asset.chains.map((chain) => (
            <span
              key={chain}
              className="inline-flex h-[22px] items-center rounded-full bg-pill px-[9px] text-[11.5px] font-medium text-muted"
            >
              {chain}
            </span>
          ))}
        </div>
      </div>
      {comingSoon ? (
        <span className="shrink-0 rounded-full border border-line bg-[#f7f7f7] px-2.5 py-1 text-[11px] font-semibold text-muted">
          Coming soon
        </span>
      ) : (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-faint"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      )}
    </button>
  );
}
