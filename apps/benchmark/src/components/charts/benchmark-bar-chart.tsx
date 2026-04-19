"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BenchmarkOperationResult } from "@/lib/benchmark/types";

interface BarSeries {
  dataKey: string;
  name: string;
  /** CSS color or `var(--token)`. */
  color: string;
}

interface BenchmarkBarChartProps {
  operations: BenchmarkOperationResult[];
  /** Maps each operation to a row keyed by operationLabel + each series dataKey. */
  rowFor: (operation: BenchmarkOperationResult) => Record<string, number>;
  series: BarSeries[];
  /** Color used for the hovered-bar background highlight. */
  cursorColor: string;
}

export function BenchmarkBarChart({ operations, rowFor, series, cursorColor }: BenchmarkBarChartProps) {
  const data = operations.map((operation) => ({ operation: operation.label, ...rowFor(operation) }));

  return (
    <div className="h-115 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 12, right: 12, top: 8, bottom: 8 }} barCategoryGap={8}>
          <CartesianGrid strokeDasharray="2 2" stroke="color-mix(in oklab, var(--chart-grid), var(--border) 70%)" />
          <XAxis type="number" tick={{ fill: "var(--foreground)", fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey="operation"
            width={220}
            tick={{ fill: "var(--foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: `color-mix(in oklab, ${cursorColor}, transparent 86%)` }}
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              color: "var(--foreground)",
            }}
          />
          {series.map((s) => (
            <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name} fill={s.color} radius={[0, 6, 6, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LatencyChart({ operations }: { operations: BenchmarkOperationResult[] }) {
  return (
    <BenchmarkBarChart
      operations={operations}
      rowFor={(op) => ({ meanMs: op.summary.meanMs, p95Ms: op.summary.p95Ms })}
      series={[
        { dataKey: "meanMs", name: "mean ms", color: "var(--chart-latency-mean)" },
        { dataKey: "p95Ms", name: "p95 ms", color: "var(--chart-latency-p95)" },
      ]}
      cursorColor="var(--chart-latency-mean)"
    />
  );
}

export function ThroughputChart({ operations }: { operations: BenchmarkOperationResult[] }) {
  return (
    <BenchmarkBarChart
      operations={operations}
      rowFor={(op) => ({ opsPerSecond: op.summary.opsPerSecond })}
      series={[{ dataKey: "opsPerSecond", name: "ops/s", color: "var(--chart-throughput)" }]}
      cursorColor="var(--chart-throughput)"
    />
  );
}
