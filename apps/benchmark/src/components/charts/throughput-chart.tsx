"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BenchmarkOperationResult } from "@/lib/benchmark/types";

interface ThroughputChartProps {
  operations: BenchmarkOperationResult[];
}

export function ThroughputChart({ operations }: ThroughputChartProps) {
  const data = operations.map((operation) => ({
    operation: operation.label,
    opsPerSecond: operation.summary.opsPerSecond,
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
          <defs>
            <linearGradient id="throughputFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-3)" stopOpacity={0.85} />
              <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0.1} />
            </linearGradient>
          </defs>
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
          <Area
            type="monotone"
            dataKey="opsPerSecond"
            name="ops/s"
            stroke="var(--chart-3)"
            fill="url(#throughputFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
