"use client";

import type { Currency } from "@sorosense/vault-client";
import { CoinBadge } from "../ui";
import { FaucetButton } from "../deposit/FaucetButton";
import { apiEnabled } from "../../lib/api/config";
import { balanceEnabled } from "../../lib/wallet/balance";
import { stablecoinByCurrency, type StablecoinSym } from "../../lib/vault/data";
import { useWallet } from "../../hooks/useWallet";

const FAUCET_ASSETS: { currency: Currency; label: StablecoinSym; detail: string }[] = [
  { currency: "USD", label: "USDC", detail: "Mint test USDC" },
  { currency: "EUR", label: "EURC", detail: "Mint test EURC" },
];

export function FaucetSection({ compact = false }: { compact?: boolean }) {
  const { address } = useWallet();
  const rows = FAUCET_ASSETS.filter(({ currency }) => {
    const coin = stablecoinByCurrency(currency);
    return apiEnabled() && address && coin && balanceEnabled(coin.sym);
  });

  if (rows.length === 0) return null;

  return (
    <section className={compact ? "px-2 pb-1 pt-1.5" : "mt-5"}>
      <h2 className={compact ? "mb-2 px-1 text-[12px] font-semibold text-muted" : "ml-1 mb-2.5 text-sm font-medium text-muted"}>
        Faucet
      </h2>
      <div className={compact ? "space-y-1.5" : "space-y-2.5"}>
        {rows.map((row) => (
          <div
            key={row.currency}
            className={
              compact
                ? "flex w-full items-center gap-[13px] rounded-xl px-3 py-2.5 text-left"
                : [
                    "flex items-center gap-3 rounded-[16px] border border-line bg-white",
                    "[box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]",
                    "px-4 py-3.5",
                  ].join(" ")
            }
          >
            <CoinBadge token={row.label} size={compact ? 28 : 40} />
            <div className="min-w-0 flex-1">
              <div className={compact ? "text-sm font-semibold" : "font-semibold"}>{row.label}</div>
              <div className={compact ? "text-[11.5px] text-muted" : "text-[12.5px] text-muted"}>{row.detail}</div>
            </div>
            <FaucetButton currency={row.currency} compact buttonClassName={compact ? "px-3!" : ""} />
          </div>
        ))}
      </div>
    </section>
  );
}
