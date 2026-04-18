import Link from "next/link";
import { GeistSans } from "geist/font/sans";
import { ExternalLink, Gauge, FlaskConical, Zap } from "lucide-react";
import baseline from "../../../../../benchmarks/baselines/main.json";

const FAST_THRESHOLD_MS = 10; // p95 < 10 ms → "instant"
const MEDIUM_THRESHOLD_MS = 50; // p95 < 50 ms → "quick"
const CHART_PADDING_FACTOR = 1.2;
const MIN_CHART_MAX_MS = 100;
const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");
const BASELINE_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

type PerformanceBucket = "instant" | "quick" | "moderate";

const BUCKET_STYLES: Record<PerformanceBucket, { bar: string; badge: string; icon: string; label: string }> = {
  instant: {
    bar: "bg-emerald-500 dark:bg-emerald-400",
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    icon: "text-emerald-500 dark:text-emerald-400",
    label: "Instant",
  },
  quick: {
    bar: "bg-orange-500 dark:bg-orange-400",
    badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    icon: "text-orange-500 dark:text-orange-400",
    label: "Quick",
  },
  moderate: {
    bar: "bg-amber-500 dark:bg-amber-400",
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    icon: "text-amber-500 dark:text-amber-400",
    label: "Moderate",
  },
};

function getPerformanceBucket(p95Ms: number): PerformanceBucket {
  if (p95Ms < FAST_THRESHOLD_MS) return "instant";
  if (p95Ms < MEDIUM_THRESHOLD_MS) return "quick";
  return "moderate";
}

function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`;
  if (ms < 10) return `${ms.toFixed(2)} ms`;
  if (ms < 100) return `${ms.toFixed(1)} ms`;
  return `${Math.round(ms)} ms`;
}

export function PerformanceSection() {
  const { operations, config } = baseline;

  const maxP95 = operations.length > 0 ? Math.max(...operations.map((op) => op.summary.p95Ms)) : MIN_CHART_MAX_MS;
  const chartMaxMs = Math.max(MIN_CHART_MAX_MS, maxP95 * CHART_PADDING_FACTOR);

  const bucketCounts: Record<PerformanceBucket, number> = { instant: 0, quick: 0, moderate: 0 };
  for (const op of operations) bucketCounts[getPerformanceBucket(op.summary.p95Ms)] += 1;

  const datasetSize = NUMBER_FORMATTER.format(config.datasetSize);

  return (
    <section className="border-fd-border/60 border-t px-6 py-16 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-12 text-center">
          <h2 className={`${GeistSans.className} text-fd-foreground mb-4 text-3xl font-bold sm:text-4xl`}>
            Built for speed. Measured honestly.
          </h2>
          <p className="text-fd-muted-foreground mx-auto max-w-2xl text-base leading-relaxed">
            Benchmarks run entirely in the browser — no server, no network. The numbers below reflect real IndexedDB
            performance on {datasetSize}-row datasets, straight from the{" "}
            <code className="text-fd-accent text-[13px]">main</code> branch.
          </p>
        </div>

        <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="border-fd-border bg-fd-card rounded-xl border p-5">
            <div className="mb-2 flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-500" />
              <span className="text-fd-muted-foreground text-xs font-medium tracking-wider uppercase">
                Operation mix
              </span>
            </div>
            <p className={`${GeistSans.className} text-fd-foreground text-3xl font-bold`}>
              {operations.length}
              <span className="text-fd-muted-foreground text-sm font-normal"> measured</span>
            </p>
            <p className="text-fd-muted-foreground mt-1 text-xs">
              {bucketCounts.instant} instant · {bucketCounts.quick} quick · {bucketCounts.moderate} moderate (p95)
            </p>
          </div>
          <div className="border-fd-border bg-fd-card rounded-xl border p-5">
            <div className="mb-2 flex items-center gap-2">
              <Gauge className={`h-4 w-4 ${BUCKET_STYLES.quick.icon}`} />
              <span className="text-fd-muted-foreground text-xs font-medium tracking-wider uppercase">Dataset</span>
            </div>
            <p className={`${GeistSans.className} text-fd-foreground text-3xl font-bold`}>
              {datasetSize}
              <span className="text-fd-muted-foreground text-sm font-normal"> rows</span>
            </p>
            <p className="text-fd-muted-foreground mt-1 text-xs">per benchmark operation, in-browser IndexedDB</p>
          </div>
          <div className="border-fd-border bg-fd-card rounded-xl border p-5">
            <div className="mb-2 flex items-center gap-2">
              <FlaskConical className="text-fd-muted-foreground h-4 w-4" />
              <span className="text-fd-muted-foreground text-xs font-medium tracking-wider uppercase">
                Measured runs
              </span>
            </div>
            <p className={`${GeistSans.className} text-fd-foreground text-3xl font-bold`}>{config.measuredRuns}</p>
            <p className="text-fd-muted-foreground mt-1 text-xs">runs per op · {config.warmupRuns} warmup · p95 gate</p>
          </div>
        </div>

        <div className="border-fd-border bg-fd-card overflow-hidden rounded-xl border shadow-sm">
          <div className="border-fd-border flex items-center justify-between border-b px-5 py-3.5">
            <span className="text-fd-foreground text-sm font-medium">p95 latency per operation</span>
            <span className="text-fd-muted-foreground text-xs">lower is better · scale 0-{formatMs(chartMaxMs)}</span>
          </div>
          <div className="divide-fd-border/60 divide-y px-5 py-2">
            {operations.map((op) => {
              const { bar, badge, label } = BUCKET_STYLES[getPerformanceBucket(op.summary.p95Ms)];
              const widthPct = Math.max(2, Math.min(100, (op.summary.p95Ms / chartMaxMs) * 100));
              return (
                <div
                  key={op.operationId}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-3.5 md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,9rem)] md:gap-4"
                >
                  <div className="min-w-0 md:w-44 md:shrink-0">
                    <p className="text-fd-foreground truncate text-sm font-medium">{op.label}</p>
                    <p className="text-fd-muted-foreground text-xs">
                      {NUMBER_FORMATTER.format(Math.round(op.summary.opsPerSecond))} ops/s
                    </p>
                  </div>
                  <div className="relative col-span-2 md:col-span-1">
                    <div className="bg-fd-muted h-6 w-full overflow-hidden rounded-full">
                      <div className={`${bar} h-full rounded-full transition-all`} style={{ width: `${widthPct}%` }} />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-end gap-2 whitespace-nowrap md:w-36">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge}`}>{label}</span>
                    <span className="text-fd-foreground font-mono text-sm font-semibold whitespace-nowrap tabular-nums">
                      {formatMs(op.summary.p95Ms)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-fd-border/60 text-fd-muted-foreground border-t px-5 py-3 text-xs">
            Baseline from <code className="text-fd-accent">main</code> · dataset size {datasetSize} · Chrome ·{" "}
            {BASELINE_DATE_FORMATTER.format(new Date(baseline.completedAt))}
            <span className="block pt-1">
              Note: bulk create/update/delete operations include IndexedDB transaction commit overhead; this reflects
              browser storage behavior, not network latency.
            </span>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="https://benchmark.prisma-idb.dev"
            target="_blank"
            rel="noreferrer"
            className="text-fd-foreground border-fd-border bg-fd-card hover:bg-fd-accent/10 inline-flex items-center gap-2 rounded-md border px-5 py-2.5 text-sm font-medium shadow-sm transition-colors"
          >
            <Gauge className="h-3.5 w-3.5" />
            Run benchmarks in your browser
            <ExternalLink className="h-3 w-3 opacity-60" />
          </Link>
          <p className="text-fd-muted-foreground mt-3 text-xs">
            Results vary by browser, device, and dataset. Run your own to see what to expect in your environment.
          </p>
        </div>
      </div>
    </section>
  );
}
