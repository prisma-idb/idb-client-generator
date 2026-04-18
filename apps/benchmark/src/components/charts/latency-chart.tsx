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
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="2 2" stroke="var(--border)" />
          <XAxis
            dataKey="operation"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            interval={0}
            angle={-18}
            dy={12}
            height={50}
          />
          <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
          <Tooltip
            cursor={{ fill: "color-mix(in oklab, var(--muted), transparent 25%)" }}
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              color: "var(--foreground)",
            }}
          />
          <Bar dataKey="meanMs" name="mean ms" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
          <Bar dataKey="p95Ms" name="p95 ms" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
