"use client";
import type { ReactNode } from "react";
import Image from "next/image";
import { useWallet } from "../../hooks/useWallet";
import { Identicon } from "../account/Identicon";

export function TopBar({ onAvatarClick, account }: { onAvatarClick?: () => void; account?: ReactNode }) {
  const { address } = useWallet();
  return (
    <header className="relative z-50 flex items-center justify-between gap-4 h-[46px] mb-[18px]">
      <span className="inline-flex items-center">
        <Image src="/brand/sorosense-wordmark.svg" alt="" width={1105} height={533} className="h-auto w-[88px]" priority />
        <span className="sr-only">SoroSense</span>
      </span>
      {account ?? (
        <button
          type="button"
          aria-label="Account"
          onClick={onAvatarClick}
          className="grid place-items-center w-[42px] h-[42px] rounded-full overflow-hidden p-0 border border-white bg-card cursor-pointer shadow-[0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.22)]"
        >
          <Identicon address={address ?? ""} size={42} />
        </button>
      )}
    </header>
  );
}
