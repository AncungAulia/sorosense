export function Toast({ open, message }: { open: boolean; message: string }) {
  return (
    <div
      role="status"
      className={`absolute inset-x-5 bottom-[104px] z-[80] flex items-center gap-3 rounded-2xl border border-white/70 bg-white/40 px-4 py-3.5 text-sm font-medium text-ink [backdrop-filter:blur(30px)_saturate(185%)] [box-shadow:0_1px_2px_rgba(17,19,22,.05),0_20px_44px_-18px_rgba(17,19,22,.32)] transition lg:fixed lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-auto lg:max-w-[360px] ${open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"}`}
    >
      <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-ink">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      </span>
      {message}
    </div>
  );
}
