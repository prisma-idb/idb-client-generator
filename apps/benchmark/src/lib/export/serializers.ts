import type { BenchmarkRunResult } from "@/lib/benchmark/types";

function sanitize(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function escapeCsv(value: string): string {
  const sanitized = sanitize(value);
  return `"${sanitized.replace(/"/g, '""')}"`;
}

export function toRunJson(run: BenchmarkRunResult): string {
  return JSON.stringify(run, null, 2);
}

export function toRunCsv(run: BenchmarkRunResult): string {
  const headers = [
    "operationId",
    "label",
    "meanMs",
    "medianMs",
    "p95Ms",
    "p99Ms",
    "stdDevMs",
    "minMs",
    "maxMs",
    "opsPerSecond",
  ];

  const rows = run.operations.map((operation) => {
    const s = operation.summary;
    return [
      escapeCsv(operation.operationId),
      escapeCsv(operation.label),
      s.meanMs,
      s.medianMs,
      s.p95Ms,
      s.p99Ms,
      s.stdDevMs,
      s.minMs,
      s.maxMs,
      s.opsPerSecond,
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

export function toRunMarkdown(run: BenchmarkRunResult): string {
  const lines = [
    "# Prisma IDB Benchmark Run",
    "",
    `- Run ID: ${run.id}`,
    `- Started: ${run.startedAt}`,
    `- Completed: ${run.completedAt}`,
    `- Dataset size: ${run.config.datasetSize}`,
    `- Warmup runs: ${run.config.warmupRuns}`,
    `- Measured runs: ${run.config.measuredRuns}`,
    `- Total duration: ${run.totalDurationMs} ms`,
    "",
    "| Operation | mean (ms) | p95 (ms) | p99 (ms) | ops/s |",
    "| --- | ---: | ---: | ---: | ---: |",
  ];

  for (const operation of run.operations) {
    lines.push(
      `| ${operation.label} | ${operation.summary.meanMs} | ${operation.summary.p95Ms} | ${operation.summary.p99Ms} | ${operation.summary.opsPerSecond} |`
    );
  }

  lines.push("", "_Environment-specific result. Compare runs on the same browser and machine._");
  return lines.join("\n");
}
