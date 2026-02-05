import Link from "next/link";
import {
  ChevronRight,
  Shield,
  Wifi,
  RefreshCw,
  Lock,
  Send,
  Code,
  BookOpen,
  Github,
  Rocket,
  GitBranch,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="from-fd-background via-fd-background to-fd-card min-h-screen bg-linear-to-b">
      <div className="mx-auto max-w-7xl px-6 py-20 sm:py-32 lg:px-8">
        {/* Hero Section */}
        <div className="space-y-8 text-center">
          <div className="space-y-4">
            <h1 className="text-fd-primary text-5xl font-bold tracking-tight sm:text-6xl">Prisma IndexedDB Client</h1>
            <p className="text-fd-muted-foreground text-xl font-light sm:text-2xl">
              Type-safe local-first database with optional bidirectional sync
            </p>
          </div>

          <p className="text-fd-muted-foreground mx-auto max-w-2xl text-lg">
            A Prisma generator that creates a familiar, type-safe client for IndexedDB. Define your schema once and get
            built-in offline support and optional server sync.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col justify-center gap-4 pt-4 sm:flex-row">
            <Link
              href="/docs"
              className="bg-fd-accent text-fd-accent-foreground inline-flex items-center justify-center gap-2 rounded-lg px-8 py-3 font-semibold transition-opacity hover:opacity-90"
            >
              <BookOpen className="h-4 w-4" />
              Get Started
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link
              href="https://github.com/prisma-idb/idb-client-generator"
              className="border-fd-border bg-fd-background text-fd-primary hover:bg-fd-card inline-flex items-center justify-center gap-2 rounded-lg border px-8 py-3 font-semibold transition-colors"
            >
              <Github className="h-4 w-4" />
              View on GitHub
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mt-20 grid grid-cols-1 gap-8 md:grid-cols-3">
          <Link
            href="/docs/crud"
            className="border-fd-border bg-fd-card hover:border-fd-accent/50 cursor-pointer space-y-3 rounded-lg border p-8 transition-colors hover:shadow-md"
          >
            <Code className="text-fd-accent h-8 w-8" />
            <h3 className="text-fd-primary text-xl font-semibold">Prisma-like API</h3>
            <p className="text-fd-muted-foreground">
              Use the syntax you already know. CRUD operations feel exactly like Prisma Client.
            </p>
          </Link>

          <Link
            href="/docs"
            className="border-fd-border bg-fd-card hover:border-fd-accent/50 cursor-pointer space-y-3 rounded-lg border p-8 transition-colors hover:shadow-md"
          >
            <Shield className="text-fd-accent h-8 w-8" />
            <h3 className="text-fd-primary text-xl font-semibold">Type Safe</h3>
            <p className="text-fd-muted-foreground">
              Fully typed operations generated directly from your Prisma schema.
            </p>
          </Link>

          <Link
            href="/docs"
            className="border-fd-border bg-fd-card hover:border-fd-accent/50 cursor-pointer space-y-3 rounded-lg border p-8 transition-colors hover:shadow-md"
          >
            <Wifi className="text-fd-accent h-8 w-8" />
            <h3 className="text-fd-primary text-xl font-semibold">Local-First</h3>
            <p className="text-fd-muted-foreground">All data lives in IndexedDB. Works offline, syncs when ready.</p>
          </Link>

          <Link
            href="/docs/sync"
            className="border-fd-border bg-fd-card hover:border-fd-accent/50 cursor-pointer space-y-3 rounded-lg border p-8 transition-colors hover:shadow-md"
          >
            <RefreshCw className="text-fd-accent h-8 w-8" />
            <h3 className="text-fd-primary text-xl font-semibold">Bidirectional Sync</h3>
            <p className="text-fd-muted-foreground">
              Optional sync engine with conflict resolution and authorization built-in.
            </p>
          </Link>

          <Link
            href="/docs/sync/authoritative-schema-dag"
            className="border-fd-border bg-fd-card hover:border-fd-accent/50 cursor-pointer space-y-3 rounded-lg border p-8 transition-colors hover:shadow-md"
          >
            <Lock className="text-fd-accent h-8 w-8" />
            <h3 className="text-fd-primary text-xl font-semibold">Ownership DAG</h3>
            <p className="text-fd-muted-foreground">
              Ownership invariants ensure users can only access and modify their data.
            </p>
          </Link>

          <Link
            href="/docs/sync/outbox-push-pull"
            className="border-fd-border bg-fd-card hover:border-fd-accent/50 cursor-pointer space-y-3 rounded-lg border p-8 transition-colors hover:shadow-md"
          >
            <Send className="text-fd-accent h-8 w-8" />
            <h3 className="text-fd-primary text-xl font-semibold">Outbox Pattern</h3>
            <p className="text-fd-muted-foreground">Reliable push operations with automatic retry and batch support.</p>
          </Link>
        </div>

        {/* Example App Link */}
        <div className="mt-20 space-y-4 text-center">
          <p className="text-fd-muted-foreground">See it in action with our example Kanban app</p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="https://pidb-kanban-example.vercel.app/"
              className="bg-fd-primary text-fd-primary-foreground inline-flex items-center justify-center gap-2 rounded-lg px-8 py-3 font-semibold transition-opacity hover:opacity-90"
            >
              <Rocket className="h-4 w-4" />
              Live Demo
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link
              href="https://github.com/prisma-idb/idb-client-generator/tree/main/apps/pidb-kanban-example"
              className="border-fd-border bg-fd-background text-fd-primary hover:bg-fd-card inline-flex items-center justify-center gap-2 rounded-lg border px-8 py-3 font-semibold transition-colors"
            >
              <GitBranch className="h-4 w-4" />
              Explore Source Code
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-fd-border bg-fd-muted mt-32 border-t py-12">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="space-y-8">
            <div className="space-y-4">
              <h3 className="text-fd-primary font-semibold">Disclaimer</h3>
              <p className="text-fd-muted-foreground max-w-2xl text-sm leading-relaxed">
                Prisma is a trademark of Prisma. Prisma IDB is an independent open-source project and is not affiliated
                with, endorsed by, or sponsored by Prisma. This library is a generator built on top of Prisma to extend
                its functionality.
              </p>
            </div>
            <div className="border-fd-border border-t pt-8">
              <p className="text-fd-muted-foreground text-sm">
                © {new Date().getFullYear()} Prisma IDB. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
