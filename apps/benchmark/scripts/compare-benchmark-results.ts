import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { BENCHMARK_REGRESSION_GATE } from "../src/lib/benchmark/types";
import { getStringArg, hasFlag, parseArgs } from "./cli-args";

interface BenchmarkOperation {
  operationId: string;
  samplesMs?: number[];
  summary?: { p95Ms?: number; meanMs?: number };
}

interface BenchmarkRun {
  id?: string;
  operations?: BenchmarkOperation[];
}

type Metric = number | "n/a";
type Delta = number | "inf" | "n/a";

interface ComparisonRow {
  operationId: string;
  baselineP95Ms: Metric;
  currentP95Ms: Metric;
  deltaP95Percent: Delta;
  baselineMeanMs: Metric;
  currentMeanMs: Metric;
  deltaMeanPercent: Delta;
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

const round = (value: number) => Number(value.toFixed(3));

function formatMetric(value: Metric): string {
  return value === "n/a" ? "n/a" : String(value);
}

function formatPercent(value: Delta): string {
  if (value === "n/a" || !Number.isFinite(value as number)) return value === "inf" ? "inf" : "n/a";
  const numeric = value as number;
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(2)}%`;
}

function deltaPercent(current: number, baseline: number): number {
  if (baseline === 0 && current === 0) return 0;
  if (baseline === 0) return Number.POSITIVE_INFINITY;
  return ((current - baseline) / baseline) * 100;
}

function pairMetric(baseline: number, current: number): { baseline: Metric; current: Metric; delta: Delta } {
  const ok = Number.isFinite(baseline) && Number.isFinite(current);
  if (!ok) {
    return {
      baseline: Number.isFinite(baseline) ? round(baseline) : "n/a",
      current: Number.isFinite(current) ? round(current) : "n/a",
      delta: "n/a",
    };
  }
  const raw = deltaPercent(current, baseline);
  return {
    baseline: round(baseline),
    current: round(current),
    delta: Number.isFinite(raw) ? round(raw) : "inf",
  };
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function renderMarkdown(summary: ComparisonSummary, threshold: number): string {
  const lines: string[] = [
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
  ];

  if (summary.notices.length > 0) {
    for (const notice of summary.notices) lines.push(`- Notice: ${notice}`);
    lines.push("");
  }

  lines.push(
    "| Operation | Baseline p95 (ms) | Current p95 (ms) | Delta p95 | Baseline mean (ms) | Current mean (ms) | Delta mean | Status |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | :---: |"
  );

  for (const row of summary.rows) {
    lines.push(
      `| ${escapeMarkdownCell(row.operationId)} | ${formatMetric(row.baselineP95Ms)} | ${formatMetric(row.currentP95Ms)} | ${formatPercent(row.deltaP95Percent)} | ${formatMetric(row.baselineMeanMs)} | ${formatMetric(row.currentMeanMs)} | ${formatPercent(row.deltaMeanPercent)} | ${row.status} |`
    );
  }

  for (const [heading, ids] of [
    ["Added Operations", summary.addedOperations],
    ["Removed Operations", summary.removedOperations],
  ] as const) {
    if (ids.length > 0) {
      lines.push("", `### ${heading}`, "");
      for (const id of ids) lines.push(`- ${id}`);
    }
  }

  lines.push("", `_Generated at ${new Date().toISOString()}_`);
  return `${lines.join("\n")}\n`;
}

async function loadJson(path: string): Promise<BenchmarkRun> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as BenchmarkRun;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${path}: ${message}`);
  }
}

function getMeasuredSampleCount(run: BenchmarkRun): { count: number | null; hasPartialData: boolean } {
  const operations = run.operations ?? [];
  const counts = operations.flatMap((op) => (Array.isArray(op.samplesMs) ? [op.samplesMs.length] : []));
  const hasPartialData = counts.length < operations.length;
  if (counts.length === 0) return { count: null, hasPartialData };
  const allEqual = counts.every((c) => c === counts[0]);
  return { count: allEqual ? (counts[0] ?? null) : null, hasPartialData };
}

function getComparisonNotices(baseline: BenchmarkRun, current: BenchmarkRun): string[] {
  const notices: string[] = [];
  const minSamples = BENCHMARK_REGRESSION_GATE.minMeaningfulP95Samples;

  let baselineCount: number | null = null;
  let currentCount: number | null = null;

  for (const [label, run] of [
    ["Baseline", baseline],
    ["Current", current],
  ] as const) {
    const { count, hasPartialData } = getMeasuredSampleCount(run);
    if (label === "Baseline") baselineCount = count;
    if (label === "Current") currentCount = count;
    if (hasPartialData) {
      notices.push(`${label} run is missing samplesMs for one or more operations; this comparison is advisory.`);
    }
    if (count === null) {
      notices.push(`${label} sample counts are missing or inconsistent across operations.`);
    } else if (count < minSamples) {
      notices.push(
        `${label} only has ${count} measured samples per operation; meaningful p95 gating starts at ${minSamples}.`
      );
    }
  }

  if (baselineCount !== null && currentCount !== null && baselineCount !== currentCount) {
    notices.push(
      `Baseline and current runs use different measured sample counts (${baselineCount} vs ${currentCount}); this comparison is advisory.`
    );
  }

  return notices;
}

async function writeOutput(filePath: string | undefined, content: string): Promise<void> {
  if (!filePath) return;
  const outputPath = resolve(process.cwd(), filePath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content, "utf8");
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

  const threshold = Number(getStringArg(args, "threshold") ?? "10");
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new Error("--threshold must be a positive number");
  }

  const [baseline, current] = await Promise.all([
    loadJson(resolve(process.cwd(), baselinePath)),
    loadJson(resolve(process.cwd(), currentPath)),
  ]);

  const baselineMap = new Map((baseline.operations ?? []).map((op) => [op.operationId, op]));
  const currentMap = new Map((current.operations ?? []).map((op) => [op.operationId, op]));

  const rows: ComparisonRow[] = [];
  const regressions: ComparisonRow[] = [];
  const addedOperations: string[] = [];
  const removedOperations: string[] = [];

  for (const operationId of new Set([...baselineMap.keys(), ...currentMap.keys()])) {
    const baselineOp = baselineMap.get(operationId);
    const currentOp = currentMap.get(operationId);

    if (!baselineOp && currentOp) {
      addedOperations.push(operationId);
      continue;
    }
    if (baselineOp && !currentOp) {
      removedOperations.push(operationId);
      continue;
    }
    if (!baselineOp || !currentOp) continue;

    const p95 = pairMetric(Number(baselineOp.summary?.p95Ms), Number(currentOp.summary?.p95Ms));
    const mean = pairMetric(Number(baselineOp.summary?.meanMs), Number(currentOp.summary?.meanMs));

    // Treat baseline=0 → current>0 as a hard regression (delta becomes +Infinity).
    const numericDelta = typeof p95.delta === "number" ? p95.delta : null;
    const isInfiniteRegression = p95.delta === "inf";
    const isRegression = isInfiniteRegression || (numericDelta !== null && numericDelta > threshold);
    const isWarn = !isRegression && (p95.delta === "n/a" || (numericDelta !== null && numericDelta >= threshold / 2));

    const row: ComparisonRow = {
      operationId,
      baselineP95Ms: p95.baseline,
      currentP95Ms: p95.current,
      deltaP95Percent: p95.delta,
      baselineMeanMs: mean.baseline,
      currentMeanMs: mean.current,
      deltaMeanPercent: mean.delta,
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

  const markdown = renderMarkdown(summary, threshold);

  await writeOutput(getStringArg(args, "json-out"), `${JSON.stringify(summary, null, 2)}\n`);
  await writeOutput(getStringArg(args, "markdown-out"), markdown);

  process.stdout.write(markdown);

  if (hasFlag(args, "exit-on-fail") && summary.shouldFail) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
