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
  browser?: string;
  operations?: BenchmarkOperation[];
}

interface MetricPair {
  baseline: number | null;
  current: number | null;
  /** Percent change vs baseline; `Infinity` for baseline=0 → current>0; `null` if either side is missing. */
  delta: number | null;
}

interface ComparisonRow {
  operationId: string;
  p95: MetricPair;
  mean: MetricPair;
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

function formatMetric(value: number | null): string {
  return value === null ? "n/a" : String(value);
}

function formatPercent(value: number | null): string {
  if (value === null) return "n/a";
  if (!Number.isFinite(value)) return "inf";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function pairMetric(baseline: number, current: number): MetricPair {
  const baselineOk = Number.isFinite(baseline);
  const currentOk = Number.isFinite(current);

  if (!baselineOk || !currentOk) {
    return {
      baseline: baselineOk ? round(baseline) : null,
      current: currentOk ? round(current) : null,
      delta: null,
    };
  }

  let delta: number;
  if (baseline === 0 && current === 0) delta = 0;
  else if (baseline === 0) delta = Number.POSITIVE_INFINITY;
  else delta = ((current - baseline) / baseline) * 100;

  return {
    baseline: round(baseline),
    current: round(current),
    delta: Number.isFinite(delta) ? round(delta) : delta,
  };
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
      `| ${row.operationId} | ${formatMetric(row.p95.baseline)} | ${formatMetric(row.p95.current)} | ${formatPercent(row.p95.delta)} | ${formatMetric(row.mean.baseline)} | ${formatMetric(row.mean.current)} | ${formatPercent(row.mean.delta)} | ${row.status} |`
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

  const runs = [
    ["Baseline", baseline],
    ["Current", current],
  ] as const;

  const counts: Record<"Baseline" | "Current", number | null> = { Baseline: null, Current: null };

  for (const [label, run] of runs) {
    const { count, hasPartialData } = getMeasuredSampleCount(run);
    counts[label] = count;
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

  if (counts.Baseline !== null && counts.Current !== null && counts.Baseline !== counts.Current) {
    notices.push(
      `Baseline and current runs use different measured sample counts (${counts.Baseline} vs ${counts.Current}); this comparison is advisory.`
    );
  }

  const baselinePlatform = getPlatformToken(baseline.browser);
  const currentPlatform = getPlatformToken(current.browser);
  if (baselinePlatform && currentPlatform && baselinePlatform !== currentPlatform) {
    notices.push(
      `Baseline and current runs were captured on different platforms (\`${baselinePlatform}\` vs \`${currentPlatform}\`); absolute timings are not comparable, so this comparison is advisory.`
    );
  }

  return notices;
}

/**
 * Extracts a coarse platform token ("Macintosh", "Linux", "Windows", "Android", "iOS")
 * from a browser User-Agent string. Returns null if the UA is missing or unrecognised.
 * Used to detect when baseline and current runs come from different machines (e.g. a
 * fast laptop baseline vs a slower CI runner) — a scenario where regression % is meaningless.
 */
function getPlatformToken(userAgent: string | undefined): string | null {
  if (!userAgent) return null;
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "Macintosh";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Android/i.test(userAgent)) return "Android";
  if (/iPhone|iPad|iOS/i.test(userAgent)) return "iOS";
  if (/Linux|X11/i.test(userAgent)) return "Linux";
  return null;
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

  const threshold = Number(getStringArg(args, "threshold") ?? String(BENCHMARK_REGRESSION_GATE.thresholdPercent));
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
    const delta = p95.delta;
    const isRegression = delta !== null && (!Number.isFinite(delta) || delta > threshold);
    const isWarn = !isRegression && (delta === null || delta >= threshold / 2);

    const row: ComparisonRow = {
      operationId,
      p95,
      mean,
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

  // JSON.stringify serializes Infinity as `null` — matches our "no comparable delta" convention.
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
