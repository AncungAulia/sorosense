import type { HTMLAttributes } from "react";
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`relative rounded-card border border-white bg-card [box-shadow:0_1px_2px_rgba(17,19,22,.03),0_14px_34px_-22px_rgba(17,19,22,.16)] ${className}`}
      {...props}
    />
  );
}
