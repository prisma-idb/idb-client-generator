"use client";

import {
  BenchmarkDashboardGuidanceCards,
  BenchmarkDashboardHero,
  BenchmarkDashboardTopBar,
  BenchmarkRunDetails,
  BenchmarkRunOverview,
  BenchmarkRunSettingsCard,
} from "./benchmark-dashboard-sections";
import { useBenchmarkDashboardController } from "./use-benchmark-dashboard-controller";

export function BenchmarkDashboard() {
  const controller = useBenchmarkDashboardController();

  return (
    <div className="relative min-h-screen">
      <BenchmarkDashboardTopBar controller={controller} />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
        <BenchmarkDashboardHero controller={controller} />
        <BenchmarkDashboardGuidanceCards />
        <BenchmarkRunSettingsCard controller={controller} />
        <BenchmarkRunOverview controller={controller} />
        <BenchmarkRunDetails controller={controller} />
      </div>

      {/* Hidden elements for Playwright CI extraction */}
      {controller.activeRun && !controller.isRunning && (
        <pre data-testid="benchmark-result" className="sr-only">
          {JSON.stringify(controller.activeRun, null, 2)}
        </pre>
      )}
      {controller.error && (
        <pre data-testid="benchmark-error" className="sr-only">
          {controller.error}
        </pre>
      )}
    </div>
  );
}
