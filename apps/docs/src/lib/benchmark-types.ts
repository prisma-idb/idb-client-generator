export const BENCHMARK_OPERATION_IDS = [
  "create-user",
  "create-many-todos",
  "find-many-completed",
  "find-many-completed-sorted",
  "find-many-completed-paginated",
  "find-many-with-user-include",
  "update-many-completed",
  "delete-many-completed",
  "find-many-title-contains",
] as const;

export type BenchmarkOperationId = (typeof BENCHMARK_OPERATION_IDS)[number];

export interface BenchmarkStatSummary {
  minMs: number;
  maxMs: number;
  meanMs: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  stdDevMs: number;
  opsPerSecond: number;
}

export interface BenchmarkOperationResult {
  operationId: BenchmarkOperationId;
  label: string;
  samplesMs: number[];
  summary: BenchmarkStatSummary;
}
