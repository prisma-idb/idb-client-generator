import { summarizeSamples } from "./stats";
import { operationDefinitions } from "./operations";
import { createBenchmarkClient } from "./client";
import type { BenchmarkConfig, BenchmarkProgress, BenchmarkRunResult } from "./types";

function nowIso() {
  return new Date().toISOString();
}

export async function runBenchmarkSuite(
  config: BenchmarkConfig,
  onProgress?: (progress: BenchmarkProgress) => void
): Promise<BenchmarkRunResult> {
  const client = await createBenchmarkClient();
  const runStart = performance.now();
  const startedAt = nowIso();
  const totalSteps = operationDefinitions.length * (config.warmupRuns + config.measuredRuns);
  let completedSteps = 0;

  const operations = [];

  for (const definition of operationDefinitions) {
    for (let warmup = 0; warmup < config.warmupRuns; warmup += 1) {
      await definition.prepare(client, config.datasetSize);
      await definition.run(client, config.datasetSize);
      completedSteps += 1;
      onProgress?.({
        completedSteps,
        totalSteps,
        currentOperationLabel: definition.label,
        phase: "warmup",
      });
    }

    const samplesMs: number[] = [];

    for (let measureIndex = 0; measureIndex < config.measuredRuns; measureIndex += 1) {
      await definition.prepare(client, config.datasetSize);
      const start = performance.now();
      await definition.run(client, config.datasetSize);
      const end = performance.now();
      samplesMs.push(end - start);
      completedSteps += 1;
      onProgress?.({
        completedSteps,
        totalSteps,
        currentOperationLabel: definition.label,
        phase: "measure",
      });
    }

    operations.push({
      operationId: definition.operationId,
      label: definition.label,
      samplesMs,
      summary: summarizeSamples(samplesMs),
    });
  }

  const runEnd = performance.now();
  const completedAt = nowIso();

  return {
    id: crypto.randomUUID(),
    startedAt,
    completedAt,
    browser: navigator.userAgent,
    config,
    totalDurationMs: Number((runEnd - runStart).toFixed(3)),
    operations,
  } as BenchmarkRunResult;
}
