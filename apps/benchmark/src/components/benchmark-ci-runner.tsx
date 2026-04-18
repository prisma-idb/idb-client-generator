"use client";

import { useEffect, useMemo, useState } from "react";
import { runBenchmarkSuite } from "@/lib/benchmark/runner";
import type { BenchmarkConfig, BenchmarkRunResult } from "@/lib/benchmark/types";

interface CiState {
  status: "idle" | "running" | "completed" | "error";
  result: BenchmarkRunResult | null;
  errorMessage: string;
}

const defaultConfig: BenchmarkConfig = {
  datasetSize: 1000,
  warmupRuns: 2,
  measuredRuns: 7,
};

function parsePositiveInt(value: string | null, fallback: number, min = 1): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  if (rounded < min) return fallback;
  return rounded;
}

export function BenchmarkCiRunner() {
  const [state, setState] = useState<CiState>({
    status: "idle",
    result: null,
    errorMessage: "",
  });

  const config = useMemo<BenchmarkConfig>(() => {
    if (typeof window === "undefined") return defaultConfig;
    const params = new URLSearchParams(window.location.search);
    return {
      datasetSize: parsePositiveInt(params.get("datasetSize"), defaultConfig.datasetSize, 100),
      warmupRuns: parsePositiveInt(params.get("warmupRuns"), defaultConfig.warmupRuns, 0),
      measuredRuns: parsePositiveInt(params.get("measuredRuns"), defaultConfig.measuredRuns, 1),
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setState({ status: "running", result: null, errorMessage: "" });
      try {
        const result = await runBenchmarkSuite(config);
        if (cancelled) return;
        setState({ status: "completed", result, errorMessage: "" });
      } catch (error) {
        if (cancelled) return;
        setState({
          status: "error",
          result: null,
          errorMessage: error instanceof Error ? error.message : "Unknown benchmark error",
        });
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [config]);

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Benchmark CI Runner</h1>
      <p data-testid="benchmark-status" className="mt-2">
        {state.status}
      </p>
      <pre data-testid="benchmark-config" className="mt-2 overflow-auto text-xs">
        {JSON.stringify(config, null, 2)}
      </pre>
      {state.result && (
        <pre data-testid="benchmark-result" className="mt-2 overflow-auto text-xs">
          {JSON.stringify(state.result, null, 2)}
        </pre>
      )}
      {state.status === "error" && (
        <pre data-testid="benchmark-error" className="mt-2 overflow-auto text-xs text-red-600">
          {state.errorMessage}
        </pre>
      )}
    </main>
  );
}
