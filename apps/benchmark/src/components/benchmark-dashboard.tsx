"use client";

import Image from "next/image";
import { BookOpenText, Download, Github, LoaderCircle, Moon, Sun, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LatencyChart } from "@/components/charts/latency-chart";
import { ThroughputChart } from "@/components/charts/throughput-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { runBenchmarkSuite } from "@/lib/benchmark/runner";
import type { BenchmarkConfig, BenchmarkProgress, BenchmarkRunResult } from "@/lib/benchmark/types";
import { downloadTextFile } from "@/lib/export/download";
import { toRunCsv, toRunJson, toRunMarkdown } from "@/lib/export/serializers";
import { clearBenchmarkHistory, getBenchmarkHistory, saveBenchmarkRun } from "@/lib/storage/history";
import Favicon from "../../../docs/src/lib/assets/favicon.png";

const datasetSizes = [500, 1000, 5000, 10000, 25000] as const;

function formatMs(value: number): string {
  if (value < 10) return `${value.toFixed(2)} ms`;
  if (value < 100) return `${value.toFixed(1)} ms`;
  return `${Math.round(value)} ms`;
}

function formatOpsPerSecond(value: number): string {
  return `${Math.round(value)} ops/s`;
}

function userImpactLabel(p95Ms: number): string {
  if (p95Ms < 20) return "Feels instant";
  if (p95Ms < 60) return "Feels quick";
  if (p95Ms < 150) return "Slightly delayed";
  return "Noticeable delay";
}

function overallExperienceLabel(medianP95Ms: number): string {
  if (medianP95Ms < 20) return "Great: interactions should feel instant for most users.";
  if (medianP95Ms < 60) return "Good: interactions should feel responsive.";
  if (medianP95Ms < 150) return "Fair: users may occasionally notice short delay.";
  return "Needs work: users are likely to feel lag.";
}

function consistencyLabel(avgJitterRatio: number): string {
  if (avgJitterRatio < 0.08) return "Very stable";
  if (avgJitterRatio < 0.18) return "Reasonably stable";
  if (avgJitterRatio < 0.3) return "Moderate variance";
  return "High variance";
}

function formatEta(ms: number | null): string {
  if (ms === null) return "Calculating ETA...";
  if (ms <= 0) return "Finishing up...";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `About ${sec}s left`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `About ${min}m ${rem}s left`;
}

export function BenchmarkDashboard() {
  const [datasetSize, setDatasetSize] = useState<number>(1000);
  const [warmupRuns, setWarmupRuns] = useState<number>(2);
  const [measuredRuns, setMeasuredRuns] = useState<number>(7);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeRun, setActiveRun] = useState<BenchmarkRunResult | null>(null);
  const [history, setHistory] = useState<BenchmarkRunResult[]>([]);
  const [progress, setProgress] = useState<BenchmarkProgress | null>(null);
  const [error, setError] = useState<string>("");
  const [themeMode, setThemeMode] = useState<"dark" | "light">("dark");
  const [runStartedAtMs, setRunStartedAtMs] = useState<number | null>(null);
  const [tick, setTick] = useState<number>(0);

  const runAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setHistory(getBenchmarkHistory());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedTheme = window.localStorage.getItem("benchmark-theme");
    const initialTheme = storedTheme === "light" || storedTheme === "dark" ? storedTheme : "dark";

    setThemeMode(initialTheme);
    document.documentElement.classList.toggle("dark", initialTheme === "dark");
  }, []);

  useEffect(() => {
    if (!isRunning) return;

    const interval = window.setInterval(() => {
      setTick((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isRunning]);

  const config: BenchmarkConfig = useMemo(
    () => ({
      datasetSize,
      warmupRuns,
      measuredRuns,
    }),
    [datasetSize, warmupRuns, measuredRuns]
  );

  const selectedRun = activeRun ?? history[0] ?? null;
  const operationCount = selectedRun?.operations.length ?? 0;

  const runInsights = useMemo(() => {
    if (!selectedRun || selectedRun.operations.length === 0) return null;

    const operations = selectedRun.operations;
    const fastestByMean = operations.reduce((best, current) =>
      current.summary.meanMs < best.summary.meanMs ? current : best
    );
    const slowestByMean = operations.reduce((best, current) =>
      current.summary.meanMs > best.summary.meanMs ? current : best
    );

    const sortedP95 = operations
      .map((operation) => operation.summary.p95Ms)
      .slice()
      .sort((a, b) => a - b);
    const medianP95 = sortedP95[Math.floor(sortedP95.length / 2)] ?? 0;

    const avgJitterRatio =
      operations.reduce((sum, operation) => {
        const mean = Math.max(0.0001, operation.summary.meanMs);
        return sum + operation.summary.stdDevMs / mean;
      }, 0) / operations.length;

    return {
      fastestByMean,
      slowestByMean,
      medianP95,
      avgJitterRatio,
      overallExperience: overallExperienceLabel(medianP95),
      consistency: consistencyLabel(avgJitterRatio),
    };
  }, [selectedRun]);

  const progressPercent = progress ? (progress.completedSteps / Math.max(1, progress.totalSteps)) * 100 : 0;

  const etaMs = useMemo(() => {
    if (!progress || !runStartedAtMs || progress.completedSteps === 0) return null;
    const elapsed = Date.now() - runStartedAtMs;
    const projectedTotal = (elapsed / progress.completedSteps) * progress.totalSteps;
    const remaining = projectedTotal - elapsed;
    return Number.isFinite(remaining) ? Math.max(0, remaining) : null;
  }, [progress, runStartedAtMs, tick]);

  function toggleTheme() {
    const nextTheme: "dark" | "light" = themeMode === "dark" ? "light" : "dark";
    setThemeMode(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    window.localStorage.setItem("benchmark-theme", nextTheme);
  }

  async function executeBenchmarks() {
    setError("");
    if (datasetSize < 100 || measuredRuns < 1) {
      setError("Please use datasetSize >= 100 and measuredRuns >= 1.");
      return;
    }

    const controller = new AbortController();
    runAbortControllerRef.current = controller;

    setIsRunning(true);
    setRunStartedAtMs(Date.now());
    setProgress({
      completedSteps: 0,
      totalSteps: 1,
      currentOperationLabel: "Preparing benchmark environment",
      phase: "warmup",
    });

    try {
      const run = await runBenchmarkSuite(
        config,
        (nextProgress) => {
          setProgress(nextProgress);
        },
        controller.signal
      );
      setActiveRun(run);
      setHistory(saveBenchmarkRun(run));
    } catch (runError) {
      if (runError instanceof DOMException && runError.name === "AbortError") {
        setError("Benchmark run was cancelled.");
      } else {
        setError(runError instanceof Error ? runError.message : "Failed to execute benchmark run");
      }
    } finally {
      runAbortControllerRef.current = null;
      setIsRunning(false);
      setProgress(null);
      setRunStartedAtMs(null);
    }
  }

  function cancelBenchmarks() {
    runAbortControllerRef.current?.abort();
  }

  function exportRun(kind: "json" | "csv" | "md") {
    if (!selectedRun) return;
    const stamp = selectedRun.completedAt.replace(/[:.]/g, "-");

    if (kind === "json") {
      downloadTextFile(`benchmark-${stamp}.json`, toRunJson(selectedRun), "application/json");
      return;
    }

    if (kind === "csv") {
      downloadTextFile(`benchmark-${stamp}.csv`, toRunCsv(selectedRun), "text/csv;charset=utf-8");
      return;
    }

    downloadTextFile(`benchmark-${stamp}.md`, toRunMarkdown(selectedRun), "text/markdown;charset=utf-8");
  }

  function clearHistory() {
    clearBenchmarkHistory();
    setHistory([]);
    setActiveRun(null);
  }

  return (
    <div className="relative min-h-screen">
      <div className="border-border/80 bg-background/85 sticky top-0 z-50 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Image src={Favicon} alt="Prisma IDB" height={36} className="h-9 w-auto" priority />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Prisma IDB Benchmark Lab</p>
              <p className="text-muted-foreground truncate text-xs">
                Track how local-first data operations feel for real users.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <a
              className="border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-8 items-center justify-center rounded-lg border transition-colors"
              href="https://github.com/prisma-idb/idb-client-generator"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
              title="GitHub"
            >
              <Github className="size-4" />
            </a>
            <a
              className="border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-8 items-center justify-center rounded-lg border transition-colors"
              href="https://www.npmjs.com/package/@prisma-idb/idb-client-generator"
              target="_blank"
              rel="noreferrer"
              aria-label="npm"
              title="npm"
            >
              <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="size-4 fill-current">
                <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
              </svg>
            </a>
            <a
              className="border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-8 items-center justify-center rounded-lg border transition-colors"
              href="https://github.com/prisma-idb/idb-client-generator/blob/main/README.md"
              target="_blank"
              rel="noreferrer"
              aria-label="Docs"
              title="Docs"
            >
              <BookOpenText className="size-4" />
            </a>

            <Button variant="outline" size="icon" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">
              {themeMode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-5 py-8 md:px-8">
        <header className="mb-6 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-3">
            <Badge variant="secondary">Performance Health Dashboard</Badge>
            <h1 className="text-foreground text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
              Understand How Fast Your App Feels
            </h1>
            <p className="text-muted-foreground max-w-3xl text-sm">
              This page measures common app actions and translates numbers into what users are likely to feel. Lower
              latency means quicker responses and smoother experience.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button variant="outline" size="sm" onClick={() => exportRun("json")} disabled={!selectedRun}>
              <Download className="mr-1.5 size-4" /> JSON
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportRun("csv")} disabled={!selectedRun}>
              <Download className="mr-1.5 size-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportRun("md")} disabled={!selectedRun}>
              <Download className="mr-1.5 size-4" /> MD
            </Button>
            <Button variant="ghost" size="sm" onClick={clearHistory} disabled={history.length === 0}>
              <Trash2 className="mr-1.5 size-4" /> Clear
            </Button>
          </div>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>What This Means</CardTitle>
              <CardDescription>Latency tells you how long users wait per action.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-muted-foreground list-disc space-y-2 pl-5 text-sm">
                <li>Under 20 ms typically feels instant.</li>
                <li>60-150 ms can feel slightly delayed.</li>
                <li>Higher p95 means some users may consistently feel lag.</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Recommended Preset</CardTitle>
              <CardDescription>Balanced for CI signal and runtime.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-muted-foreground list-disc space-y-2 pl-5 text-sm">
                <li>Dataset size: 1,000 rows</li>
                <li>Warmup: 2 runs</li>
                <li>Measured: 7 runs</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Comparison Rule</CardTitle>
              <CardDescription>Use same browser and machine profile.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-muted-foreground list-disc space-y-2 pl-5 text-sm">
                <li>Compare against baseline on the same environment.</li>
                <li>Focus on p95 changes first for user-facing impact.</li>
                <li>Use multiple runs to reduce random noise.</li>
              </ul>
            </CardContent>
          </Card>
        </section>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Run Settings</CardTitle>
            <CardDescription>Choose workload size and repeat count, then run the full benchmark suite.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-12">
              <div className="grid gap-2 md:col-span-3">
                <Label htmlFor="dataset-size">Dataset size</Label>
                <Select
                  value={String(datasetSize)}
                  onValueChange={(value) => setDatasetSize(Number(value))}
                  disabled={isRunning}
                >
                  <SelectTrigger id="dataset-size" className="w-full" size="default">
                    <SelectValue placeholder="Select dataset size" />
                  </SelectTrigger>
                  <SelectContent>
                    {datasetSizes.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size.toLocaleString()} rows
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2 md:col-span-3">
                <Label htmlFor="warmup-runs">Warmup runs</Label>
                <Input
                  id="warmup-runs"
                  type="number"
                  min={0}
                  max={8}
                  value={warmupRuns}
                  onChange={(event) => setWarmupRuns(Number(event.target.value))}
                  disabled={isRunning}
                />
              </div>

              <div className="grid gap-2 md:col-span-3">
                <Label htmlFor="measured-runs">Measured runs</Label>
                <Input
                  id="measured-runs"
                  type="number"
                  min={1}
                  max={30}
                  value={measuredRuns}
                  onChange={(event) => setMeasuredRuns(Number(event.target.value))}
                  disabled={isRunning}
                />
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 md:col-span-3">
                <Button className="w-full min-w-0" onClick={executeBenchmarks} disabled={isRunning}>
                  {isRunning ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
                  {isRunning ? "Running benchmarks..." : "Run benchmarks"}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={cancelBenchmarks}
                  disabled={!isRunning}
                  aria-label="Cancel benchmark run"
                  title="Cancel benchmark run"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            {progress && (
              <div className="mt-4 space-y-2">
                <Progress value={progressPercent}>
                  <ProgressLabel>{progress.currentOperationLabel}</ProgressLabel>
                  <span className="text-muted-foreground ms-auto text-sm tabular-nums">
                    {progress.completedSteps}/{progress.totalSteps} {progress.phase === "warmup" ? "warmup" : "measure"}
                  </span>
                </Progress>
                <p className="text-muted-foreground text-xs">{formatEta(etaMs)}</p>
              </div>
            )}
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </CardContent>
        </Card>

        <section className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>Total Run Time</CardTitle>
              <CardDescription>How long the complete suite took.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-foreground text-2xl font-semibold">
                {selectedRun ? formatMs(selectedRun.totalDurationMs) : "-"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Scenario Coverage</CardTitle>
              <CardDescription>How many interaction patterns were tested.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-foreground text-2xl font-semibold">{operationCount || "-"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>User Experience Outlook</CardTitle>
              <CardDescription>Based on median p95 latency.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-foreground text-sm font-medium">
                {runInsights?.overallExperience ?? "Run a benchmark to see this."}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Consistency</CardTitle>
              <CardDescription>How stable the results are run to run.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-foreground text-2xl font-semibold">{runInsights?.consistency ?? "-"}</p>
              <p className="text-muted-foreground mt-1 text-xs">Saved history: {history.length}</p>
            </CardContent>
          </Card>
        </section>

        {selectedRun && (
          <>
            <section className="mb-6 grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Fastest Scenario</CardTitle>
                  <CardDescription>Lowest average latency in this run.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-foreground font-medium">{runInsights?.fastestByMean.label ?? "-"}</p>
                  <p className="text-muted-foreground text-sm">
                    {runInsights ? formatMs(runInsights.fastestByMean.summary.meanMs) : "-"}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Most Expensive Scenario</CardTitle>
                  <CardDescription>Highest average latency in this run.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-foreground font-medium">{runInsights?.slowestByMean.label ?? "-"}</p>
                  <p className="text-muted-foreground text-sm">
                    {runInsights ? formatMs(runInsights.slowestByMean.summary.meanMs) : "-"}
                  </p>
                </CardContent>
              </Card>
            </section>

            <section className="mb-6 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Latency (mean vs p95)</CardTitle>
                  <CardDescription>
                    Mean is average speed. p95 shows near worst-case user wait time and is often the most useful signal.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <LatencyChart operations={selectedRun.operations} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Throughput (ops/s)</CardTitle>
                  <CardDescription>
                    Higher values mean the operation can be processed more times per second.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ThroughputChart operations={selectedRun.operations} />
                </CardContent>
              </Card>
            </section>

            <Card>
              <CardHeader>
                <CardTitle>Operation Summary</CardTitle>
                <CardDescription>
                  This table combines technical metrics with a plain-language impact label for each benchmarked action.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Operation</TableHead>
                      <TableHead>Average</TableHead>
                      <TableHead>p95</TableHead>
                      <TableHead>Throughput</TableHead>
                      <TableHead>User Impact</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedRun.operations.map((operation) => (
                      <TableRow key={operation.operationId}>
                        <TableCell>{operation.label}</TableCell>
                        <TableCell>{formatMs(operation.summary.meanMs)}</TableCell>
                        <TableCell>{formatMs(operation.summary.p95Ms)}</TableCell>
                        <TableCell>{formatOpsPerSecond(operation.summary.opsPerSecond)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{userImpactLabel(operation.summary.p95Ms)}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
