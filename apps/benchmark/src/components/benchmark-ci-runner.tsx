"use client";

import { useEffect, useMemo, useState } from "react";
import { sanitizeBenchmarkConfigInputs } from "@/lib/benchmark/config-validation";
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

export function BenchmarkCiRunner() {
  const [state, setState] = useState<CiState>({
    status: "idle",
    result: null,
    errorMessage: "",
  });

  const configResult = useMemo(() => {
    if (typeof window === "undefined") {
      return sanitizeBenchmarkConfigInputs(defaultConfig);
    }
    const params = new URLSearchParams(window.location.search);
    return sanitizeBenchmarkConfigInputs({
      datasetSize: params.get("datasetSize") ?? defaultConfig.datasetSize,
      warmupRuns: params.get("warmupRuns") ?? defaultConfig.warmupRuns,
      measuredRuns: params.get("measuredRuns") ?? defaultConfig.measuredRuns,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!configResult.ok) {
      setState({
        status: "error",
        result: null,
        errorMessage: configResult.error,
      });
      return;
    }

    const sanitizedConfig = configResult.config;

    async function run() {
      setState({ status: "running", result: null, errorMessage: "" });
      try {
        const result = await runBenchmarkSuite(sanitizedConfig);
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
  }, [configResult]);

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Benchmark CI Runner</h1>
      <p data-testid="benchmark-status" className="mt-2">
        {state.status}
      </p>
      <pre data-testid="benchmark-config" className="mt-2 overflow-auto text-xs">
        {JSON.stringify(configResult.ok ? configResult.config : null, null, 2)}
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
