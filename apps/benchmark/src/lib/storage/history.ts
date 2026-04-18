import type { BenchmarkRunResult } from "@/lib/benchmark/types";

const STORAGE_KEY = "prisma-idb-benchmark-history-v1";
const MAX_RUNS = 30;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidBenchmarkRunResult(value: unknown): value is BenchmarkRunResult {
  if (!isObject(value)) return false;

  const operations = value.operations;
  const config = value.config;

  if (typeof value.id !== "string") return false;
  if (typeof value.startedAt !== "string" || Number.isNaN(Date.parse(value.startedAt))) return false;
  if (typeof value.completedAt !== "string" || Number.isNaN(Date.parse(value.completedAt))) return false;
  if (typeof value.browser !== "string") return false;
  if (!isFiniteNumber(value.totalDurationMs)) return false;

  if (!isObject(config)) return false;
  if (!isFiniteNumber(config.datasetSize)) return false;
  if (!isFiniteNumber(config.warmupRuns)) return false;
  if (!isFiniteNumber(config.measuredRuns)) return false;

  if (!Array.isArray(operations)) return false;

  return operations.every((operation) => {
    if (!isObject(operation)) return false;
    if (typeof operation.operationId !== "string") return false;
    if (typeof operation.label !== "string") return false;
    if (!Array.isArray(operation.samplesMs) || !operation.samplesMs.every((sample) => isFiniteNumber(sample))) {
      return false;
    }

    const summary = operation.summary;
    if (!isObject(summary)) return false;

    return (
      isFiniteNumber(summary.minMs) &&
      isFiniteNumber(summary.maxMs) &&
      isFiniteNumber(summary.meanMs) &&
      isFiniteNumber(summary.medianMs) &&
      isFiniteNumber(summary.p95Ms) &&
      isFiniteNumber(summary.p99Ms) &&
      isFiniteNumber(summary.stdDevMs) &&
      isFiniteNumber(summary.opsPerSecond)
    );
  });
}

function parseStoredHistory(raw: string): BenchmarkRunResult[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is BenchmarkRunResult => isValidBenchmarkRunResult(item));
  } catch {
    return [];
  }
}

export function getBenchmarkHistory(): BenchmarkRunResult[] {
  if (!isBrowser()) return [];

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }

  if (!raw) return [];

  return parseStoredHistory(raw);
}

export function saveBenchmarkRun(run: BenchmarkRunResult): BenchmarkRunResult[] {
  const existing = getBenchmarkHistory();
  const next = [run, ...existing].slice(0, MAX_RUNS);

  if (isBrowser()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.error(`Failed to persist benchmark history (key: ${STORAGE_KEY}, run: ${run.id}):`, error);
    }
  }

  return next;
}

export function clearBenchmarkHistory() {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error(`Failed to clear benchmark history (key: ${STORAGE_KEY}):`, error);
  }
}
