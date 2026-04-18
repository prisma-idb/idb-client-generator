"use client";

import { Download, Play, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LatencyChart } from "@/components/charts/latency-chart";
import { ThroughputChart } from "@/components/charts/throughput-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const datasetSizes = [500, 1000, 5000, 10000, 25000] as const;

export function BenchmarkDashboard() {
  const [datasetSize, setDatasetSize] = useState<number>(500);
  const [warmupRuns, setWarmupRuns] = useState<number>(1);
  const [measuredRuns, setMeasuredRuns] = useState<number>(5);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeRun, setActiveRun] = useState<BenchmarkRunResult | null>(null);
  const [history, setHistory] = useState<BenchmarkRunResult[]>([]);
  const [progress, setProgress] = useState<BenchmarkProgress | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    setHistory(getBenchmarkHistory());
  }, []);

  const config: BenchmarkConfig = useMemo(
    () => ({
      datasetSize,
      warmupRuns,
      measuredRuns,
    }),
    [datasetSize, warmupRuns, measuredRuns]
  );

  const selectedRun = activeRun ?? history[0] ?? null;

  async function executeBenchmarks() {
    setError("");
    if (datasetSize < 100 || measuredRuns < 1) {
      setError("Please use datasetSize >= 100 and measuredRuns >= 1.");
      return;
    }

    setIsRunning(true);
    setProgress({
      completedSteps: 0,
      totalSteps: 1,
      currentOperationLabel: "Preparing benchmark environment",
      phase: "warmup",
    });
    try {
      const run = await runBenchmarkSuite(config, (nextProgress) => {
        setProgress(nextProgress);
      });
      setActiveRun(run);
      setHistory(saveBenchmarkRun(run));
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Failed to execute benchmark run");
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
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

  const progressPercent = progress ? (progress.completedSteps / Math.max(1, progress.totalSteps)) * 100 : 0;

  return (
    <div className="relative z-10 mx-auto w-full max-w-6xl px-5 py-10 md:px-8">
      <header className="mb-6 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-3">
          <Badge variant="secondary">Benchmarking Dashboard</Badge>
          <h1 className="text-foreground text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
            Local Performance Benchmarks
          </h1>
          <p className="text-muted-foreground max-w-3xl text-sm">
            Benchmarks run entirely in your browser and reflect your local environment. Keep machine, browser, and
            profile consistent when comparing runs.
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

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Run Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="grid gap-2">
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

            <div className="grid gap-2">
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

            <div className="grid gap-2">
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

            <div className="flex items-end gap-2">
              <Button className="w-full" onClick={executeBenchmarks} disabled={isRunning}>
                {isRunning ? <RotateCcw className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}
                {isRunning ? "Running..." : "Run benchmarks"}
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
            </div>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Total Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground text-2xl font-semibold">
              {selectedRun ? `${selectedRun.totalDurationMs} ms` : "-"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Operations per Run</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground text-2xl font-semibold">
              {selectedRun ? selectedRun.operations.length : "-"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Saved History</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground text-2xl font-semibold">{history.length}</p>
          </CardContent>
        </Card>
      </section>

      {selectedRun && (
        <>
          <section className="mb-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Latency (mean vs p95)</CardTitle>
              </CardHeader>
              <CardContent>
                <LatencyChart operations={selectedRun.operations} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Throughput (ops/s)</CardTitle>
              </CardHeader>
              <CardContent>
                <ThroughputChart operations={selectedRun.operations} />
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Operation Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operation</TableHead>
                    <TableHead>mean ms</TableHead>
                    <TableHead>p95 ms</TableHead>
                    <TableHead>p99 ms</TableHead>
                    <TableHead>ops/s</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedRun.operations.map((operation) => (
                    <TableRow key={operation.operationId}>
                      <TableCell>{operation.label}</TableCell>
                      <TableCell>{operation.summary.meanMs}</TableCell>
                      <TableCell>{operation.summary.p95Ms}</TableCell>
                      <TableCell>{operation.summary.p99Ms}</TableCell>
                      <TableCell>{operation.summary.opsPerSecond}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
