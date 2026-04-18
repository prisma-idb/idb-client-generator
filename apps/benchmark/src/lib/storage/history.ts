import type { BenchmarkRunResult } from "@/lib/benchmark/types";

const STORAGE_KEY = "prisma-idb-benchmark-history-v1";
const MAX_RUNS = 30;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getBenchmarkHistory(): BenchmarkRunResult[] {
  if (!isBrowser()) return [];

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as BenchmarkRunResult[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveBenchmarkRun(run: BenchmarkRunResult): BenchmarkRunResult[] {
  const existing = getBenchmarkHistory();
  const next = [run, ...existing].slice(0, MAX_RUNS);

  if (isBrowser()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  return next;
}

export function clearBenchmarkHistory() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}
