import type { ReactNode } from "react";
export function BottomSheet({
  open, onClose, children, label,
}: { open: boolean; onClose: () => void; children: ReactNode; label?: string }) {
  return (
    <>
      <div
        data-testid="scrim"
        onClick={onClose}
        className={`absolute inset-0 z-50 bg-black/40 backdrop-blur-[2px] transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <div
        data-testid="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`absolute inset-x-0 bottom-0 z-[51] max-h-[90%] overflow-y-auto rounded-t-sheet border-t border-white bg-card px-5 pb-6 pt-2 transition-transform ${open ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="mx-auto mb-4 mt-1.5 h-[5px] w-10 rounded-full bg-black/10" />
        {children}
      </div>
    </>
  );
}
