import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("runs benchmark suite and exports JSON result", async ({ page }) => {
  test.setTimeout(12 * 60 * 1000);

  const datasetSize = Number(process.env.BENCHMARK_DATASET_SIZE ?? "1000");
  const warmupRuns = Number(process.env.BENCHMARK_WARMUP_RUNS ?? "2");
  const measuredRuns = Number(process.env.BENCHMARK_MEASURED_RUNS ?? "7");

  await page.goto(`/ci?datasetSize=${datasetSize}&warmupRuns=${warmupRuns}&measuredRuns=${measuredRuns}`);

  const errorNode = page.getByTestId("benchmark-error");
  await expect(errorNode).toHaveCount(0);

  const resultNode = page.getByTestId("benchmark-result");
  await expect(resultNode).toBeVisible({ timeout: 10 * 60 * 1000 });

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

  const resultPath = resolve(
    process.cwd(),
    process.env.BENCHMARK_RESULT_PATH ?? "../../benchmarks/results/current.json"
  );
  await mkdir(dirname(resultPath), { recursive: true });
  await writeFile(resultPath, `${JSON.stringify(parsedResult, null, 2)}\n`, "utf8");

  test.info().annotations.push({ type: "benchmark-result", description: resultPath });
});
