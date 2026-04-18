import type { BenchmarkRunResult } from "@/lib/benchmark/types";

export function toRunJson(run: BenchmarkRunResult): string {
  return JSON.stringify(run, null, 2);
}
