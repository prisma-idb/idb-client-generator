"use client";

import dynamic from "next/dynamic";

const BenchmarkDashboard = dynamic(() => import("@/components/benchmark-dashboard").then((m) => m.BenchmarkDashboard), {
  ssr: false,
});

export default function Page() {
  return <BenchmarkDashboard />;
}
