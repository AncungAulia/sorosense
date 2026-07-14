import type { ButtonHTMLAttributes } from "react";

type Variant = "ink" | "glass";
const base =
  "flex w-full h-14 items-center justify-center gap-2 rounded-full text-base font-semibold transition-transform active:scale-[.985] disabled:pointer-events-none disabled:opacity-40 disabled:active:scale-100";
const variants: Record<Variant, string> = {
  ink: "text-[#f8f8f8] [background:linear-gradient(180deg,#3d3d40,#171719)] [box-shadow:inset_0_1px_0_rgba(255,255,255,.2),inset_0_-9px_16px_-9px_rgba(0,0,0,.6),0_10px_22px_-10px_rgba(0,0,0,.42)]",
  glass: "bg-white text-ink-2 border border-line [box-shadow:inset_0_1px_0_rgba(255,255,255,.85),0_8px_18px_-10px_rgba(0,0,0,.18)]",
};

export function Button({
  variant = "ink",
  className = "",
  ...props
}: { variant?: Variant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
