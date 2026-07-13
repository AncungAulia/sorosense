"use client";
import type { ReactNode } from "react";
import { useWallet } from "../../hooks/useWallet";
import { Identicon } from "../account/Identicon";

export function TopBar({ onAvatarClick, account }: { onAvatarClick?: () => void; account?: ReactNode }) {
  const { address } = useWallet();
  return (
    <header className="relative z-50 flex items-center justify-between gap-4 h-[46px] mb-[18px]">
      <span className="inline-flex items-center gap-2.5 font-semibold text-[19px] tracking-[-0.01em]">
        <span className="grid place-items-center w-8 h-8 rounded-[10px] bg-[linear-gradient(180deg,#34383a,#131617)] shadow-[0_10px_24px_-12px_rgba(17,19,22,.6),inset_0_1px_0_rgba(255,255,255,.18)]">
          <svg viewBox="0 0 24 24" className="w-[19px] h-[19px] fill-none stroke-[#22c55e] [stroke-width:2.2]">
            <path d="M20 4C9 4 4 11 4 20c9 0 16-5 16-16Z" />
          </svg>
        </span>
        SoroSense
      </span>
      {account ?? (
        <button
          type="button"
          aria-label="Account"
          onClick={onAvatarClick}
          className="grid place-items-center w-[42px] h-[42px] rounded-full overflow-hidden p-0 border border-line bg-[#e8e8e6] cursor-pointer shadow-[0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]"
        >
          <Identicon address={address ?? ""} size={42} />
        </button>
      )}
    </header>
  );
}
