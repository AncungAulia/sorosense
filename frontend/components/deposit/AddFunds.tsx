"use client";
import { useRouter } from "next/navigation";
import { Card, CoinBadge } from "../ui";
import { SubHeader } from "../ui/SubHeader";
import { STABLECOINS } from "../../lib/vault/data";

export function AddFunds() {
  const router = useRouter();
  return (
    <div>
      <SubHeader title="Add funds" />
      <h2 className="ml-1 mb-2.5 text-sm font-medium text-muted">Stablecoins</h2>
      <Card className="px-5 py-1">
        {STABLECOINS.map((s, i) => (
          <button key={s.sym} onClick={() => router.push(`/deposit/${s.sym.toLowerCase()}`)}
            className={`flex w-full items-center gap-[13px] py-3.5 text-left ${i === 0 ? "" : "border-t border-line"}`}>
            <CoinBadge token={s.sym} size={40} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{s.sym}</div>
              <div className="mt-[5px] flex flex-wrap gap-1.5">
                {s.chains.map((c) => <span key={c} className="inline-flex h-[22px] items-center rounded-full bg-pill px-[9px] text-[11.5px] font-medium text-muted">{c}</span>)}
              </div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-faint"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        ))}
      </Card>
    </div>
  );
}
