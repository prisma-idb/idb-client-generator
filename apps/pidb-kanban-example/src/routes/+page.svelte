<script lang="ts">
  import { resolve } from "$app/paths";
  import Button from "$lib/components/ui/button/button.svelte";
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "$lib/components/ui/card";
  import { ArrowRight, Database, Zap, GithubIcon, AlertCircle, BookOpen, Code } from "@lucide/svelte";
  import favicon from "$lib/assets/favicon.png";
  import logo from "$lib/assets/prisma-idb-logo.png";
</script>

<svelte:head>
  <title>Prisma IDB Kanban</title>
  <meta
    name="description"
    content="A type-safe, offline-first IndexedDB client for Prisma with built-in bidirectional synchronization."
  />
</svelte:head>

<div class="bg-background flex min-h-screen flex-col">
  <!-- Navigation -->
  <nav class="border-border/50 sticky top-0 z-50 border-b backdrop-blur-sm">
    <div class="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
      <a
        href="https://idb-client-generator-docs.vercel.app/"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-2"
      >
        <img src={logo} alt="Prisma IDB Logo" class="h-8 w-8" />
      </a>
      <img src={favicon} alt="Prisma IDB Kanban Logo" class="h-8 w-8" />
      <div class="text-foreground text-xl font-bold">Prisma IDB Kanban</div>
      <div class="ml-auto flex items-center gap-4">
        <a
          href="https://idb-client-generator-docs.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          class="text-muted-foreground hover:text-foreground transition"
          title="Documentation"
        >
          <BookOpen class="h-5 w-5" />
        </a>
        <a
          href="https://www.npmjs.com/package/@prisma-idb/idb-client-generator"
          target="_blank"
          rel="noopener noreferrer"
          class="text-muted-foreground hover:text-foreground transition"
          title="npm Package"
        >
          <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 fill-current">
            <path
              d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z"
            />
          </svg>
        </a>
        <a
          href="https://github.com/prisma-idb/idb-client-generator"
          target="_blank"
          rel="noopener noreferrer"
          class="text-muted-foreground hover:text-foreground transition"
          title="GitHub Repository"
        >
          <GithubIcon class="h-5 w-5" />
        </a>
      </div>
    </div>
  </nav>

  <!-- Hero Section -->
  <div class="flex flex-1 flex-col items-center justify-center px-4 py-20">
    <div class="max-w-3xl">
      <div class="flex flex-col items-center">
        <div
          class="border-border bg-card text-muted-foreground mb-4 inline-block rounded-full border px-3 py-1 text-sm"
        >
          Kanban App Demo
        </div>
        <h1 class="text-foreground mb-6 text-5xl font-bold md:text-6xl">Offline-First Kanban</h1>
        <p class="text-muted-foreground mx-auto mb-12 max-w-2xl text-center text-xl">
          A fully functional kanban board that works offline and syncs automatically. Built to showcase the Prisma IDB
          generator with real-world patterns.
        </p>
      </div>

      <div class="mb-16 flex flex-col justify-center gap-4 sm:flex-row">
        <a href={resolve("/dashboard")}>
          <Button size="lg" class="w-full sm:w-auto">
            <Code class="mr-2 h-4 w-4" />
            Open App
            <ArrowRight class="ml-2 h-4 w-4" />
          </Button>
        </a>
        <a href="https://idb-client-generator-docs.vercel.app/" target="_blank" rel="noopener noreferrer">
          <Button size="lg" variant="outline" class="w-full sm:w-auto">
            <BookOpen class="mr-2 h-4 w-4" />
            Documentation
          </Button>
        </a>
        <a href="https://github.com/prisma-idb/idb-client-generator" target="_blank" rel="noopener noreferrer">
          <Button size="lg" variant="outline" class="w-full sm:w-auto">
            <GithubIcon class="mr-2 h-4 w-4" />
            View Source
          </Button>
        </a>
      </div>

      <!-- Warning Section -->
      <div class="border-destructive bg-card my-8 rounded-lg border p-4" role="alert" aria-live="polite">
        <div class="flex items-start gap-3">
          <AlertCircle class="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <h3 class="font-semibold">Testing Demo</h3>
            <p class="mt-1 text-sm">
              This is a testing and demonstration application. Data is not persistent and may be deleted at any point.
              This project is designed to showcase the Prisma IDB generator and offline-sync capabilities, not as a
              production kanban tool.
            </p>
          </div>
        </div>
      </div>

      <!-- Feature Grid -->
      <div class="mt-20 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader class="flex flex-row items-center gap-4">
            <div class="bg-primary/10 inline-block rounded-lg p-3">
              <Database class="text-primary" />
            </div>
            <CardTitle class="text-foreground">IndexedDB Powered</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              All data stored locally in IndexedDB. Create, edit, and manage boards and todos without a network
              connection.
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="flex flex-row items-center gap-4">
            <div class="bg-primary/10 inline-block rounded-lg p-3">
              <Zap class="text-primary" />
            </div>
            <CardTitle class="text-foreground">Background Sync Worker</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Sync worker runs in the background, pushing changes to server and pulling updates. Manual and automatic
              sync modes.
            </CardDescription>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <footer class="border-border mt-20 border-t">
    <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div class="text-muted-foreground space-y-4 text-center text-sm">
        <p>Built with Prisma • Powered by IndexedDB</p>
        <div class="border-muted-foreground/30 border-t pt-4">
          <p class="text-xs">
            © {new Date().getFullYear()} Prisma IDB. This project is licensed under the GNU Affero General Public License
            v3.0.
          </p>
          <p class="mt-2 text-xs">
            Prisma is a trademark of Prisma. Prisma IDB is an independent open-source project and is not affiliated
            with, endorsed by, or sponsored by Prisma.
          </p>
        </div>
      </div>
    </div>
  </footer>
</div>
