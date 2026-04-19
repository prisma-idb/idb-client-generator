import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { BENCHMARK_DEFAULT_CONFIG } from "../src/lib/benchmark/types";

function parseEnvInteger(name: string, defaultValue: number, minValue: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (raw === "") return defaultValue;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < minValue) {
    throw new Error(`Environment variable ${name} must be an integer >= ${minValue}, got: ${JSON.stringify(raw)}`);
  }
  return value;
}

test("runs benchmark suite and exports JSON result", async ({ page }) => {
  test.setTimeout(12 * 60 * 1000);

  const datasetSize = parseEnvInteger("BENCHMARK_DATASET_SIZE", BENCHMARK_DEFAULT_CONFIG.datasetSize, 1);
  const warmupRuns = parseEnvInteger("BENCHMARK_WARMUP_RUNS", BENCHMARK_DEFAULT_CONFIG.warmupRuns, 0);
  const measuredRuns = parseEnvInteger("BENCHMARK_MEASURED_RUNS", BENCHMARK_DEFAULT_CONFIG.measuredRuns, 1);

  await page.goto(`/?autoStart&datasetSize=${datasetSize}&warmupRuns=${warmupRuns}&measuredRuns=${measuredRuns}`);

  const errorNode = page.getByTestId("benchmark-error");
  await expect(errorNode).toHaveCount(0);

  const resultNode = page.getByTestId("benchmark-result");
  await expect(resultNode).toBeAttached({ timeout: 10 * 60 * 1000 });

  const resultText = await resultNode.textContent();
  if (!resultText) {
    throw new Error("Benchmark result payload is empty");
  }

  const parsedResult = JSON.parse(resultText) as {
    operations: Array<{ operationId: string; summary: { p95Ms: number; meanMs: number } }>;
  };

  expect(Array.isArray(parsedResult.operations)).toBe(true);
  expect(parsedResult.operations.length).toBeGreaterThan(0);

  for (const operation of parsedResult.operations) {
    expect(operation.summary.p95Ms).toBeGreaterThanOrEqual(0);
    expect(operation.summary.meanMs).toBeGreaterThanOrEqual(0);
  }

  const resultWithPlatform = { ...parsedResult, platform: process.platform };

  const resultPath = resolve(
    process.cwd(),
    process.env.BENCHMARK_RESULT_PATH ?? "../../benchmarks/results/current.json"
  );
  await mkdir(dirname(resultPath), { recursive: true });
  await writeFile(resultPath, `${JSON.stringify(resultWithPlatform, null, 2)}\n`, "utf8");

  test.info().annotations.push({ type: "benchmark-result", description: resultPath });
});
