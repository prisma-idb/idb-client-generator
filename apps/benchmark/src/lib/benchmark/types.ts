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

export const BENCHMARK_DATASET_SIZE_OPTIONS = [500, 1000, 5000, 10000, 25000] as const;

export interface BenchmarkConfig {
  datasetSize: number;
  warmupRuns: number;
  measuredRuns: number;
}

export const BENCHMARK_DEFAULT_CONFIG: BenchmarkConfig = {
  datasetSize: 1000,
  warmupRuns: 2,
  measuredRuns: 20,
};

export const BENCHMARK_REGRESSION_GATE = {
  thresholdPercent: 10,
  minMeaningfulP95Samples: 20,
} as const;

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
  platform?: string;
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
