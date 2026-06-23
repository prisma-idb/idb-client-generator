<script lang="ts">
  import { getContext } from "svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { BookOpenIcon, DatabaseIcon, GitBranchIcon, WifiIcon } from "@lucide/svelte";
  import { KANBAN_CTX, type KanbanStore } from "$lib/stores/kanban.svelte";
  import ThemeToggle from "./ThemeToggle.svelte";

  const DOCS_URL = "https://prisma-idb.dev/docs/prisma-next/kanban-example";
  const GITHUB_URL = "https://github.com/prisma-idb/idb-client-generator/tree/main/apps/prisma-next-idb-kanban-example";

  const kanban = getContext<KanbanStore>(KANBAN_CTX);
</script>

<header class="flex flex-col gap-4 border-b border-border/80 pb-4 lg:flex-row lg:items-end lg:justify-between">
  <div class="flex flex-col gap-4 md:flex-row md:items-start">
    <img class="size-14 shrink-0 rounded-md border bg-card p-1.5 shadow-xs" src="/icons/icon-192x192.png" alt="" />

    <div class="space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <Badge variant="outline" class="border-primary/40 bg-primary/10 text-foreground">
          <DatabaseIcon />
          Prisma Next IDB
        </Badge>
        <Badge
          variant={kanban.status === "ready" ? "secondary" : kanban.status === "error" ? "destructive" : "outline"}
        >
          {kanban.status === "opening" ? "Opening" : kanban.status === "ready" ? "Ready" : "Error"}
        </Badge>
        <Badge variant="outline" class="border-accent/25 bg-accent/10 text-accent">
          <WifiIcon />
          Offline shell
        </Badge>
      </div>
      <div>
        <h1 class="text-2xl font-semibold tracking-normal md:text-3xl">Prisma Next IDB Kanban</h1>
        <p class="text-muted-foreground max-w-2xl text-sm">
          Local users, boards, and todos managed directly through the IndexedDB ORM.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button href={DOCS_URL} target="_blank" rel="noreferrer">
          <BookOpenIcon />
          Docs
        </Button>
        <Button href={GITHUB_URL} target="_blank" rel="noreferrer" variant="outline">
          <GitBranchIcon />
          GitHub
        </Button>
        <ThemeToggle />
      </div>
    </div>
  </div>

  <div class="grid grid-cols-3 gap-2 text-sm md:min-w-80">
    <div class="rounded-md border bg-card px-3 py-2">
      <div class="text-muted-foreground text-xs">Users</div>
      <div class="font-semibold">{kanban.users.length}</div>
    </div>
    <div class="rounded-md border bg-card px-3 py-2">
      <div class="text-muted-foreground text-xs">Boards</div>
      <div class="font-semibold">{kanban.boards.length}</div>
    </div>
    <div class="rounded-md border bg-card px-3 py-2">
      <div class="text-muted-foreground text-xs">Done</div>
      <div class="font-semibold">{kanban.completedTodos}/{kanban.todos.length}</div>
    </div>
  </div>
</header>
