import Link from "next/link";
import { GeistSans } from "geist/font/sans";
import { ChevronRight, BookOpen, Rocket } from "lucide-react";
import { SocialProof } from "./social-proof";

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pt-16 pb-10 sm:pt-24 sm:pb-16 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/2 h-150 w-225 -translate-x-1/2 -translate-y-1/4 rounded-full bg-[hsl(32,100%,50%)] opacity-[0.04] blur-[120px] dark:opacity-[0.07]" />
      </div>

      <div className="relative mx-auto max-w-3xl text-center">
        <p className="text-fd-muted-foreground animate-fade-in-up mb-5 text-sm font-medium tracking-widest uppercase">
          Prisma generator for IndexedDB
        </p>
        <h1
          className={`${GeistSans.className} text-fd-foreground animate-fade-in-up text-3xl leading-[1.15] font-medium tracking-tight sm:text-5xl`}
          style={{ animationDelay: "0.06s" }}
        >
          You already write Prisma on the server. <span className="text-fd-accent">Now write it in the browser.</span>
        </h1>

        <p
          className="text-fd-muted-foreground animate-fade-in-up mx-auto mt-6 max-w-2xl text-base leading-relaxed sm:text-lg"
          style={{ animationDelay: "0.15s" }}
        >
          A Prisma generator that creates a type-safe IndexedDB client with the API you already know — plus an optional
          sync engine that handles conflict resolution, ownership, and offline-first data for you.
        </p>

        <div
          className="animate-fade-in-up mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          style={{ animationDelay: "0.24s" }}
        >
          <Link
            href="/docs/quick-start"
            className="text-fd-primary-foreground inline-flex items-center gap-2 rounded-md bg-[hsl(32,100%,50%)] px-6 py-2.5 text-sm font-medium tracking-wide transition-all hover:bg-[hsl(32,100%,45%)]"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Get Started
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="https://kanban.prisma-idb.dev/"
            className="text-fd-muted-foreground hover:text-fd-foreground inline-flex items-center gap-2 rounded-md px-6 py-2.5 text-sm font-medium tracking-wide transition-colors"
          >
            <Rocket className="h-3.5 w-3.5" />
            Live Demo
          </Link>
        </div>

        <div className="animate-fade-in-up mt-8" style={{ animationDelay: "0.33s" }}>
          <SocialProof />
        </div>
      </div>
    </section>
  );
}
