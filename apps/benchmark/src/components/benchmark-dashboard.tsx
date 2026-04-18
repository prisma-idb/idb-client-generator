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
      <BenchmarkDashboardTopBar themeMode={controller.themeMode} onToggleTheme={controller.toggleTheme} />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
        <BenchmarkDashboardHero
          selectedRun={controller.selectedRun}
          historyCount={controller.historyCount}
          onExportRun={controller.exportRun}
          onClearHistory={controller.clearHistory}
        />
        <BenchmarkDashboardGuidanceCards />
        <BenchmarkRunSettingsCard
          datasetSize={controller.datasetSize}
          warmupRunsInput={controller.warmupRunsInput}
          measuredRunsInput={controller.measuredRunsInput}
          isRunning={controller.isRunning}
          progress={controller.progress}
          progressPercent={controller.progressPercent}
          etaLabel={controller.etaLabel}
          error={controller.error}
          onDatasetSizeChange={controller.setDatasetSize}
          onWarmupRunsChange={controller.setWarmupRunsInput}
          onMeasuredRunsChange={controller.setMeasuredRunsInput}
          onExecuteBenchmarks={() => void controller.executeBenchmarks()}
          onCancelBenchmarks={controller.cancelBenchmarks}
        />
        <BenchmarkRunOverview
          selectedRun={controller.selectedRun}
          operationCount={controller.operationCount}
          runInsights={controller.runInsights}
          historyCount={controller.historyCount}
        />
        <BenchmarkRunDetails selectedRun={controller.selectedRun} runInsights={controller.runInsights} />
      </div>

      {/* Hidden elements for Playwright CI extraction */}
      {controller.selectedRun && !controller.isRunning && (
        <pre data-testid="benchmark-result" className="sr-only">
          {JSON.stringify(controller.selectedRun, null, 2)}
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
