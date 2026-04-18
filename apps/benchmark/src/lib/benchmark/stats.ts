import type { BenchmarkStatSummary } from "./types";

function round(value: number): number {
  return Number(value.toFixed(3));
}

function percentile(sortedValues: number[], p: number): number {
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1));
  return sortedValues[index] ?? 0;
}

export function summarizeSamples(samplesMs: number[]): BenchmarkStatSummary {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const meanMs = sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length);
  const variance =
    sorted.reduce((sum, value) => {
      const delta = value - meanMs;
      return sum + delta * delta;
    }, 0) / Math.max(1, sorted.length);
  const stdDevMs = Math.sqrt(variance);
  const medianMs = percentile(sorted, 50);
  const p95Ms = percentile(sorted, 95);
  const p99Ms = percentile(sorted, 99);
  const minMs = sorted[0] ?? 0;
  const maxMs = sorted[sorted.length - 1] ?? 0;

  return {
    minMs: round(minMs),
    maxMs: round(maxMs),
    meanMs: round(meanMs),
    medianMs: round(medianMs),
    p95Ms: round(p95Ms),
    p99Ms: round(p99Ms),
    stdDevMs: round(stdDevMs),
    opsPerSecond: round(meanMs === 0 ? 0 : 1000 / meanMs),
  };
}
