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
  platform?: string;
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
  noisy?: boolean;
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

/** Coefficient of variation threshold above which a measurement is flagged as noisy. */
const CV_THRESHOLD = 0.3;

/** Coefficient of variation (stdDev / mean). High CV → noisy measurement. */
function coefficientOfVariation(samples: number[] | undefined): number | null {
  if (!samples || samples.length < 2) return null;
  const n = samples.length;
  const mean = samples.reduce((s, v) => s + v, 0) / n;
  if (mean === 0) return null;
  const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance) / mean;
}

function formatMetric(value: number | null): string {
  return value === null ? "n/a" : String(value);
}

function formatDelta(value: number | null): string {
  if (value === null) return "n/a";
  if (!Number.isFinite(value)) return "∞";
  const sign = value > 0 ? "+" : "";
  const formatted = `${sign}${value.toFixed(2)}%`;
  if (value > 10) return `**${formatted}** 📈`;
  if (value < -10) return `**${formatted}** 📉`;
  return formatted;
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
  // Derive the gate state from the actual outcome (shouldFail) first so the
  // displayed label matches CI gating behavior. Notices are surfaced as a
  // secondary "advisory" annotation rather than overriding the primary state.
  const gateIcon = summary.shouldFail ? "❌" : "✅";
  const baseLabel = summary.shouldFail ? "FAILED" : "passed";
  const advisorySuffix = summary.notices.length > 0 ? " — ℹ️ advisory notes" : "";
  const gateLabel = `${baseLabel}${advisorySuffix}`;

  const lines: string[] = [
    "## Benchmark Regression Report",
    "",
    `| | |`,
    `| :-- | :-- |`,
    `| **Gate metric** | p95 latency |`,
    `| **Gate mode** | ${gateIcon} ${gateLabel} |`,
    `| **Regression threshold** | +${threshold}% and ≥${BENCHMARK_REGRESSION_GATE.minAbsoluteDeltaMs}ms absolute |`,
    `| **Compared operations** | ${summary.rows.length} |`,
    `| **Regressions** | ${summary.regressions.length > 0 ? `⚠️ ${summary.regressions.length}` : `${summary.regressions.length}`} |`,
    `| **Added / Removed** | ${summary.addedOperations.length} / ${summary.removedOperations.length} |`,
    "",
  ];

  if (summary.notices.length > 0) {
    lines.push("> [!NOTE]");
    for (const notice of summary.notices) lines.push(`> ${notice}`);
    lines.push("");
  }

  lines.push(
    "| Status | Operation | Baseline p95 | Current p95 | Δ p95 | Baseline mean | Current mean | Δ mean |",
    "| :---: | :-- | ---: | ---: | ---: | ---: | ---: | ---: |"
  );

  for (const row of summary.rows) {
    const statusIcon = row.status === "FAIL" ? (row.noisy ? "🟠" : "🔴") : row.status === "WARN" ? "🟡" : "🟢";
    const noisyTag = row.noisy ? " 🎲" : "";
    const deltaP95 = formatDelta(row.p95.delta);
    const deltaMean = formatDelta(row.mean.delta);
    lines.push(
      `| ${statusIcon} | \`${row.operationId}\`${noisyTag} | ${formatMetric(row.p95.baseline)} | ${formatMetric(row.p95.current)} | ${deltaP95} | ${formatMetric(row.mean.baseline)} | ${formatMetric(row.mean.current)} | ${deltaMean} |`
    );
  }

  for (const [heading, ids] of [
    ["Added Operations", summary.addedOperations],
    ["Removed Operations", summary.removedOperations],
  ] as const) {
    if (ids.length > 0) {
      lines.push("", `### ${heading}`, "");
      for (const id of ids) lines.push(`- \`${id}\``);
    }
  }

  const hasNoisy = summary.rows.some((r) => r.noisy);

  lines.push("");
  lines.push("<details><summary>Legend</summary>", "");
  lines.push("| Symbol | Meaning |");
  lines.push("| :---: | :-- |");
  lines.push("| 🟢 | Pass — within threshold |");
  lines.push("| 🟡 | Warn — approaching threshold |");
  lines.push("| 🔴 | Fail — exceeds threshold |");
  if (hasNoisy) {
    lines.push("| 🟠 | Fail but noisy — high variance makes this unreliable |");
    lines.push(
      `| 🎲 | High coefficient of variation (CV > ${(CV_THRESHOLD * 100).toFixed(0)}%) — samples are spread out |`
    );
  }
  lines.push("| 📈 | Regression > 10% |");
  lines.push("| 📉 | Improvement > 10% |");
  lines.push("", "</details>");

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

    // Flag operations where either run has high coefficient of variation.
    // A high CV means the samples are spread out, making any % delta unreliable.
    const baselineCV = coefficientOfVariation(baselineOp.samplesMs);
    const currentCV = coefficientOfVariation(currentOp.samplesMs);
    const noisy =
      (baselineCV !== null && baselineCV > CV_THRESHOLD) || (currentCV !== null && currentCV > CV_THRESHOLD);

    // Treat baseline=0 → current>0 as a hard regression (delta becomes +Infinity).
    // Also require the absolute change to exceed minAbsoluteDeltaMs to avoid flagging
    // sub-millisecond jitter on fast operations as regressions.
    const delta = p95.delta;
    const minAbsDelta = BENCHMARK_REGRESSION_GATE.minAbsoluteDeltaMs;
    const absoluteP95Delta =
      p95.baseline !== null && p95.current !== null ? Math.abs(p95.current - p95.baseline) : null;
    const exceedsPercent = delta !== null && (!Number.isFinite(delta) || delta > threshold);
    const exceedsAbsolute = absoluteP95Delta === null || absoluteP95Delta >= minAbsDelta;
    const isRegression = exceedsPercent && exceedsAbsolute;
    const isWarn = !isRegression && (delta === null || delta >= threshold / 2);

    const row: ComparisonRow = {
      operationId,
      p95,
      mean,
      status: isRegression ? "FAIL" : isWarn ? "WARN" : "PASS",
      noisy,
    };
    rows.push(row);
    if (isRegression && !noisy) regressions.push(row);
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
    shouldFail: regressions.length > 0 || removedOperations.length > 0,
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
