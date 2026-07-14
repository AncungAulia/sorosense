import { RiskSection } from "../../components/RiskSection";

/* DEV preview — the chosen Risk section (chart + typewriter story), with a
   white strip standing in for the end of Simulate so the transition shows.
   Remove before PR. */
export default function RiskPreviewPage() {
  return (
    <main>
      <section className="flex h-[80vh] items-end justify-center bg-white pb-6">
        <span className="font-mono text-xs text-muted">
          ↑ Simulate (white) · scroll down to The Risk ↓
        </span>
      </section>
      <RiskSection />
      <section className="h-[60vh] bg-paper" />
    </main>
  );
}
