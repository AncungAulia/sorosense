import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { RiskSection } from "@/components/RiskSection";
import { SmoothScroll } from "@/components/SmoothScroll";

export default function Home() {
  return (
    <>
      <SmoothScroll />
      <Nav />
      <main>
        <Hero />
        <RiskSection />
      </main>
    </>
  );
}
