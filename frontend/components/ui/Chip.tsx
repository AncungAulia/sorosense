import type { HTMLAttributes } from "react";
export function Chip({ className = "", ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`inline-flex h-[26px] items-center gap-1.5 rounded-full bg-pill px-[11px] text-xs font-medium text-muted ${className}`}
      {...props}
    />
  );
}
