import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { RiskSection } from "@/components/RiskSection";
import { SafetySection } from "@/components/SafetySection";
import { SmoothScroll } from "@/components/SmoothScroll";

export default function Home() {
  return (
    <>
      <SmoothScroll />
      <Nav />
      <main>
        <Hero />
        <RiskSection />
        <SafetySection />
      </main>
    </>
  );
}
