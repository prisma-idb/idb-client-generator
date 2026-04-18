import { summarizeSamples } from "./stats";
import { operationDefinitions } from "./operations";
import type { BenchmarkConfig, BenchmarkOperationResult, BenchmarkProgress, BenchmarkRunResult } from "./types";

function nowIso() {
  return new Date().toISOString();
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new DOMException("Benchmark run cancelled", "AbortError");
}

export async function runBenchmarkSuite(
  config: BenchmarkConfig,
  onProgress?: (progress: BenchmarkProgress) => void,
  signal?: AbortSignal
): Promise<BenchmarkRunResult> {
  throwIfAborted(signal);
  const { PrismaIDBClient } = await import("../prisma-idb/client/prisma-idb-client");
  const client = await PrismaIDBClient.createClient();
  const runStart = performance.now();
  const startedAt = nowIso();
  const totalSteps = operationDefinitions.length * (config.warmupRuns + config.measuredRuns);
  let completedSteps = 0;

  const operations: BenchmarkOperationResult[] = [];

  for (const definition of operationDefinitions) {
    for (let warmup = 0; warmup < config.warmupRuns; warmup += 1) {
      throwIfAborted(signal);
      await definition.prepare(client, config.datasetSize);
      throwIfAborted(signal);
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
      throwIfAborted(signal);
      await definition.prepare(client, config.datasetSize);
      throwIfAborted(signal);
      const start = performance.now();
      await definition.run(client, config.datasetSize);
      const end = performance.now();
      samplesMs.push(end - start);
      throwIfAborted(signal);
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
