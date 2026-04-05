import { Hero } from "./hero";
import { CodeComparison } from "./code-comparison";
import { SyncSection } from "./sync-section";
import { DemoSection } from "./demo-section";
import { QuickInstall } from "./quick-install";
import { Footer } from "./footer";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <Hero />
      <CodeComparison />
      <SyncSection />
      <DemoSection />
      <QuickInstall />
      <Footer />
    </div>
  );
}
