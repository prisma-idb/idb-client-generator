import { Hero } from "./hero";
import { CodeComparison } from "./code-comparison";
import { DemoSection } from "./demo-section";
import { SyncSection } from "./sync-section";
import { ComparisonSection } from "./comparison-section";
import { QuickInstall } from "./quick-install";
import { Footer } from "./footer";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <Hero />
      <CodeComparison />
      <DemoSection />
      <SyncSection />
      <ComparisonSection />
      <QuickInstall />
      <Footer />
    </div>
  );
}
