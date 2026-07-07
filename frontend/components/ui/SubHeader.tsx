"use client";
import { useRouter } from "next/navigation";

export function SubHeader({ title }: { title: string }) {
  const router = useRouter();
  return (
    <div className="relative mb-[18px] flex h-11 items-center justify-center">
      <button aria-label="Back" onClick={() => router.back()}
        className="absolute left-0 grid h-[42px] w-[42px] place-items-center rounded-full border border-white bg-card [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <h1 className="text-lg font-semibold">{title}</h1>
    </div>
  );
}
