import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { BENCHMARK_REGRESSION_GATE } from "../src/lib/benchmark/types";
import { getStringArg, hasFlag, parseArgs } from "./cli-args";

interface BenchmarkSummary {
  p95Ms?: number;
  meanMs?: number;
}

interface BenchmarkOperation {
  operationId: string;
  samplesMs?: number[];
  summary?: BenchmarkSummary;
}

interface BenchmarkRun {
  id?: string;
  operations?: BenchmarkOperation[];
}

interface ComparisonRow {
  operationId: string;
  baselineP95Ms: number | "n/a";
  currentP95Ms: number | "n/a";
  deltaP95Percent: number | "inf" | "n/a";
  baselineMeanMs: number | "n/a";
  currentMeanMs: number | "n/a";
  deltaMeanPercent: number | "inf" | "n/a";
  status: "PASS" | "WARN" | "FAIL";
}

interface ComparisonSummary {
  thresholdPercent: number;
  comparedAt: string;
  baselineRunId: string | null;
  currentRunId: string | null;
  isAdvisory: boolean;
  notices: string[];
  rows: ComparisonRow[];
  regressions: ComparisonRow[];
  addedOperations: string[];
  removedOperations: string[];
  shouldFail: boolean;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function formatMetric(value: number | "n/a"): string {
  if (value === "n/a") return value;
  return String(value);
}

function formatPercent(value: number | "inf" | "n/a"): string {
  if (value === "n/a") return "n/a";
  if (value === "inf") return "inf";
  if (!Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function deltaPercent(current: number, baseline: number): number {
  if (baseline === 0 && current === 0) return 0;
  if (baseline === 0) return Number.POSITIVE_INFINITY;
  return ((current - baseline) / baseline) * 100;
}

function toOperationMap(run: BenchmarkRun): Map<string, BenchmarkOperation> {
  const map = new Map<string, BenchmarkOperation>();
  for (const operation of run.operations ?? []) {
    map.set(operation.operationId, operation);
  }
  return map;
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function createMarkdown(summary: ComparisonSummary, threshold: number): string {
  const lines = [
    "## Benchmark Regression Report",
    "",
    "- Gate metric: p95 latency",
    `- Gate mode: ${summary.isAdvisory ? "advisory" : "enforcing"}`,
    `- Regression threshold: +${threshold}%`,
    `- Compared operations: ${summary.rows.length}`,
    `- Regressions: ${summary.regressions.length}`,
    `- Added operations: ${summary.addedOperations.length}`,
    `- Removed operations: ${summary.removedOperations.length}`,
    "",
    "| Operation | Baseline p95 (ms) | Current p95 (ms) | Delta p95 | Baseline mean (ms) | Current mean (ms) | Delta mean | Status |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | :---: |",
  ];

  if (summary.notices.length > 0) {
    lines.splice(8, 0, ...summary.notices.map((notice) => `- Notice: ${notice}`), "");
  }

  for (const row of summary.rows) {
    const operationId = escapeMarkdownCell(row.operationId);
    lines.push(
      `| ${operationId} | ${formatMetric(row.baselineP95Ms)} | ${formatMetric(row.currentP95Ms)} | ${formatPercent(row.deltaP95Percent)} | ${formatMetric(row.baselineMeanMs)} | ${formatMetric(row.currentMeanMs)} | ${formatPercent(row.deltaMeanPercent)} | ${row.status} |`
    );
  }

  if (summary.addedOperations.length > 0) {
    lines.push("", "### Added Operations", "");
    for (const operationId of summary.addedOperations) {
      lines.push(`- ${operationId}`);
    }
  }

  if (summary.removedOperations.length > 0) {
    lines.push("", "### Removed Operations", "");
    for (const operationId of summary.removedOperations) {
      lines.push(`- ${operationId}`);
    }
  }

  lines.push("", `_Generated at ${new Date().toISOString()}_`);

  return `${lines.join("\n")}\n`;
}

async function loadJson(path: string): Promise<BenchmarkRun> {
  const content = await readFile(path, "utf8");
  try {
    return JSON.parse(content) as BenchmarkRun;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${path}: ${message}`);
  }
}

function getMeasuredSampleCount(run: BenchmarkRun): number | null {
  const counts = (run.operations ?? [])
    .map((operation) => (Array.isArray(operation.samplesMs) ? operation.samplesMs.length : null))
    .filter((count): count is number => count !== null);

  if (counts.length === 0) return null;
  return counts.every((count) => count === counts[0]) ? counts[0] : null;
}

function getComparisonNotices(baseline: BenchmarkRun, current: BenchmarkRun): string[] {
  const notices: string[] = [];
  const baselineSampleCount = getMeasuredSampleCount(baseline);
  const currentSampleCount = getMeasuredSampleCount(current);
  const meaningfulSampleFloor = BENCHMARK_REGRESSION_GATE.minMeaningfulP95Samples;

  if (baselineSampleCount === null) {
    notices.push("Baseline sample counts are missing or inconsistent across operations.");
  } else if (baselineSampleCount < meaningfulSampleFloor) {
    notices.push(
      `Baseline only has ${baselineSampleCount} measured samples per operation; meaningful p95 gating starts at ${meaningfulSampleFloor}.`
    );
  }

  if (currentSampleCount === null) {
    notices.push("Current run sample counts are missing or inconsistent across operations.");
  } else if (currentSampleCount < meaningfulSampleFloor) {
    notices.push(
      `Current run only has ${currentSampleCount} measured samples per operation; meaningful p95 gating starts at ${meaningfulSampleFloor}.`
    );
  }

  if (baselineSampleCount !== null && currentSampleCount !== null && baselineSampleCount !== currentSampleCount) {
    notices.push(
      `Baseline and current runs use different measured sample counts (${baselineSampleCount} vs ${currentSampleCount}); this comparison is advisory.`
    );
  }

  return notices;
}

async function main() {
  const args = parseArgs(process.argv);
  const baselinePath = getStringArg(args, "baseline");
  const currentPath = getStringArg(args, "current");

  if (!baselinePath || !currentPath) {
    throw new Error(
      "Usage: compare-benchmark-results.ts --baseline <path> --current <path> [--threshold 10] [--json-out <path>] [--markdown-out <path>] [--exit-on-fail]"
    );
  }

  const thresholdRaw = getStringArg(args, "threshold") ?? "10";
  const threshold = Number(thresholdRaw);
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new Error("--threshold must be a positive number");
  }

  const [baseline, current] = await Promise.all([
    loadJson(resolve(process.cwd(), baselinePath)),
    loadJson(resolve(process.cwd(), currentPath)),
  ]);

  const baselineMap = toOperationMap(baseline);
  const currentMap = toOperationMap(current);
  const operationIds = new Set([...baselineMap.keys(), ...currentMap.keys()]);

  const rows: ComparisonRow[] = [];
  const regressions: ComparisonRow[] = [];
  const addedOperations: string[] = [];
  const removedOperations: string[] = [];

  for (const operationId of operationIds) {
    const baselineOperation = baselineMap.get(operationId);
    const currentOperation = currentMap.get(operationId);

    if (!baselineOperation && currentOperation) {
      addedOperations.push(operationId);
      continue;
    }

    if (baselineOperation && !currentOperation) {
      removedOperations.push(operationId);
      continue;
    }

    if (!baselineOperation || !currentOperation) {
      continue;
    }

    const baselineP95 = Number(baselineOperation.summary?.p95Ms);
    const currentP95 = Number(currentOperation.summary?.p95Ms);
    const baselineMean = Number(baselineOperation.summary?.meanMs);
    const currentMean = Number(currentOperation.summary?.meanMs);

    const hasP95Metrics = Number.isFinite(baselineP95) && Number.isFinite(currentP95);
    const hasMeanMetrics = Number.isFinite(baselineMean) && Number.isFinite(currentMean);

    const deltaP95Raw = hasP95Metrics ? deltaPercent(currentP95, baselineP95) : Number.NaN;
    const deltaMeanRaw = hasMeanMetrics ? deltaPercent(currentMean, baselineMean) : Number.NaN;

    const isRegression = hasP95Metrics && Number.isFinite(deltaP95Raw) && deltaP95Raw > threshold;
    const isWarn =
      !isRegression &&
      (!hasP95Metrics ||
        !Number.isFinite(deltaP95Raw) ||
        (Number.isFinite(deltaP95Raw) && deltaP95Raw >= threshold / 2));

    const row: ComparisonRow = {
      operationId,
      baselineP95Ms: Number.isFinite(baselineP95) ? round(baselineP95) : "n/a",
      currentP95Ms: Number.isFinite(currentP95) ? round(currentP95) : "n/a",
      deltaP95Percent: hasP95Metrics ? (Number.isFinite(deltaP95Raw) ? round(deltaP95Raw) : "inf") : "n/a",
      baselineMeanMs: hasMeanMetrics ? round(baselineMean) : "n/a",
      currentMeanMs: hasMeanMetrics ? round(currentMean) : "n/a",
      deltaMeanPercent: hasMeanMetrics ? (Number.isFinite(deltaMeanRaw) ? round(deltaMeanRaw) : "inf") : "n/a",
      status: isRegression ? "FAIL" : isWarn ? "WARN" : "PASS",
    };

    rows.push(row);
    if (isRegression) regressions.push(row);
  }

  rows.sort((a, b) => a.operationId.localeCompare(b.operationId));
  regressions.sort((a, b) => a.operationId.localeCompare(b.operationId));
  addedOperations.sort();
  removedOperations.sort();
  const notices = getComparisonNotices(baseline, current);
  const isAdvisory = notices.length > 0;

  const summary: ComparisonSummary = {
    thresholdPercent: threshold,
    comparedAt: new Date().toISOString(),
    baselineRunId: baseline.id ?? null,
    currentRunId: current.id ?? null,
    isAdvisory,
    notices,
    rows,
    regressions,
    addedOperations,
    removedOperations,
    shouldFail: !isAdvisory && (regressions.length > 0 || removedOperations.length > 0),
  };

  const markdown = createMarkdown(summary, threshold);

  const jsonOut = getStringArg(args, "json-out");
  if (jsonOut) {
    const outputPath = resolve(process.cwd(), jsonOut);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  }

  const markdownOut = getStringArg(args, "markdown-out");
  if (markdownOut) {
    const outputPath = resolve(process.cwd(), markdownOut);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, markdown, "utf8");
  }

  process.stdout.write(markdown);

  if (hasFlag(args, "exit-on-fail") && summary.shouldFail) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
