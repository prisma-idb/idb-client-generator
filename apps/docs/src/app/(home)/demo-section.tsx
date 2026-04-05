import Link from "next/link";
import { GeistSans } from "geist/font/sans";
import { Rocket, GitBranch } from "lucide-react";

export function DemoSection() {
  return (
    <section className="px-6 py-16 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className={`${GeistSans.className} text-fd-foreground text-3xl font-bold sm:text-4xl`}>
              See it in action
            </h2>
            <p className="text-fd-muted-foreground mt-4 text-lg leading-relaxed">
              A full-stack Kanban board built with Prisma IDB, SvelteKit, and bidirectional sync. Drag tasks, go
              offline, come back — everything syncs.
            </p>
            <div className="mt-8 flex gap-3">
              <Link
                href="https://kanban.prisma-idb.dev/"
                className="text-fd-primary-foreground inline-flex items-center gap-2 rounded-md bg-[hsl(32,100%,50%)] px-6 py-2.5 text-sm font-medium tracking-wide transition-all hover:bg-[hsl(32,100%,45%)]"
              >
                <Rocket className="h-3.5 w-3.5" />
                Try the Live Demo
              </Link>
              <Link
                href="https://github.com/prisma-idb/idb-client-generator/tree/main/apps/pidb-kanban-example"
                className="text-fd-muted-foreground hover:text-fd-foreground inline-flex items-center gap-2 rounded-md px-6 py-2.5 text-sm font-medium tracking-wide transition-colors"
              >
                <GitBranch className="h-3.5 w-3.5" />
                View Source
              </Link>
            </div>
          </div>

          {/* Browser Frame */}
          <div className="group border-fd-border relative overflow-hidden rounded-xl border bg-zinc-100 shadow-2xl dark:bg-zinc-900">
            {/* Title bar */}
            <div className="border-fd-border flex items-center gap-2 border-b bg-zinc-50 px-4 py-3 dark:bg-zinc-900/80">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                <div className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                <div className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              </div>
              <div className="mx-auto flex items-center gap-1.5 rounded-md bg-zinc-200 px-3 py-1 dark:bg-zinc-800">
                <span className="text-fd-muted-foreground text-[11px]">kanban.prisma-idb.dev</span>
              </div>
            </div>
            {/* Video */}
            <div className="aspect-video w-full bg-zinc-950">
              <video
                src="https://www.w3schools.com/html/mov_bbb.mp4"
                className="h-full w-full object-cover"
                autoPlay
                muted
                loop
                playsInline
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
