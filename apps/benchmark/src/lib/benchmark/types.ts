export type BenchmarkOperationId =
  | "create-user"
  | "create-many-todos"
  | "find-many-completed"
  | "find-many-completed-sorted"
  | "find-many-completed-paginated"
  | "find-many-with-user-include"
  | "update-many-completed"
  | "delete-many-completed"
  | "find-many-title-contains";

export interface BenchmarkConfig {
  datasetSize: number;
  warmupRuns: number;
  measuredRuns: number;
}

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

export interface BenchmarkRunResult {
  id: string;
  startedAt: string;
  completedAt: string;
  browser: string;
  config: BenchmarkConfig;
  totalDurationMs: number;
  operations: BenchmarkOperationResult[];
}

export interface BenchmarkProgress {
  completedSteps: number;
  totalSteps: number;
  currentOperationLabel: string;
  phase: "warmup" | "measure";
}
