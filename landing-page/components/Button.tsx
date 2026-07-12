import type { AnchorHTMLAttributes } from "react";

type Variant = "blue" | "blueSolid" | "ink" | "ghostDark" | "ghostLight";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition select-none active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink";

const sizes = {
  md: "px-7 py-3.5 text-base",
  sm: "px-5 py-2.5 text-sm",
};

const variants: Record<Variant, string> = {
  blue: "bg-brand text-ink hover:bg-brand-strong",
  blueSolid: "bg-brand-ink text-cloud hover:bg-[#35529f]",
  ink: "bg-ink text-cloud hover:bg-[#24242a]",
  ghostDark: "border border-white/30 text-cloud hover:bg-white/10",
  ghostLight: "border border-ink/15 text-ink hover:bg-ink/5",
};

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: Variant;
  size?: keyof typeof sizes;
};

export function Button({
  variant = "blue",
  size = "md",
  className = "",
  ...props
}: Props) {
  return (
    <a
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
