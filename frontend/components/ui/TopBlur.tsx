/**
 * Progressive blur strip pinned to the top of the viewport — the mirror of the
 * BottomNav's blur. Stacked backdrop-filter layers with mask gradients make the
 * blur strongest at the very top edge and fade to nothing lower down, so content
 * dissolves into a soft blur as it scrolls up under it. Purely decorative.
 */
export function TopBlur() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[38] h-[72px] overflow-hidden">
      <div className="absolute inset-0 [backdrop-filter:blur(2px)] [mask-image:linear-gradient(to_bottom,#000_0%,#000_52%,transparent_100%)]" />
      <div className="absolute inset-0 [backdrop-filter:blur(5px)] [mask-image:linear-gradient(to_bottom,#000_0%,#000_30%,transparent_58%)]" />
      <div className="absolute inset-0 [backdrop-filter:blur(9px)] [mask-image:linear-gradient(to_bottom,#000_0%,#000_15%,transparent_36%)]" />
      <div className="absolute inset-0 [background:linear-gradient(180deg,rgba(242,242,242,.5),transparent)]" />
    </div>
  );
}
