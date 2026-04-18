"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BenchmarkOperationResult } from "@/lib/benchmark/types";

interface LatencyChartProps {
  operations: BenchmarkOperationResult[];
}

export function LatencyChart({ operations }: LatencyChartProps) {
  const data = operations.map((operation) => ({
    operation: operation.label,
    meanMs: operation.summary.meanMs,
    p95Ms: operation.summary.p95Ms,
  }));

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
            cursor={{ fill: "color-mix(in oklab, var(--chart-latency-mean), transparent 86%)" }}
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              color: "var(--foreground)",
            }}
          />
          <Bar dataKey="meanMs" name="mean ms" fill="var(--chart-latency-mean)" radius={[0, 6, 6, 0]} />
          <Bar dataKey="p95Ms" name="p95 ms" fill="var(--chart-latency-p95)" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
