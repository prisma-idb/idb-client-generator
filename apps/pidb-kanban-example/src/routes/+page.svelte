<script lang="ts">
  import { resolve } from "$app/paths";
  import Button from "$lib/components/ui/button/button.svelte";
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "$lib/components/ui/card";
  import { ArrowRight, Database, Zap, GithubIcon } from "@lucide/svelte";
  import favicon from "$lib/assets/favicon.png";
</script>

<div class="bg-background flex min-h-screen flex-col">
  <!-- Navigation -->
  <nav class="border-border/50 sticky top-0 z-50 border-b backdrop-blur-sm">
    <div class="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
      <img src={favicon} alt="Prisma IDB Logo" class="h-8 w-8" />
      <div class="text-foreground text-xl font-bold">Prisma IDB</div>
      <div class="ml-auto flex items-center gap-4">
        <a
          href="https://github.com/prisma-idb/idb-client-generator"
          target="_blank"
          rel="noopener noreferrer"
          class="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm transition"
        >
          <GithubIcon />
          GitHub
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
            Open App
            <ArrowRight class="ml-2 h-4 w-4" />
          </Button>
        </a>
        <a href="https://github.com/prisma-idb/idb-client-generator" target="_blank" rel="noopener noreferrer">
          <Button size="lg" variant="outline" class="w-full sm:w-auto">View Source</Button>
        </a>
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
      <div class="text-muted-foreground text-center text-sm">
        <p>Built with Prisma • Powered by IndexedDB</p>
      </div>
    </div>
  </footer>
</div>
