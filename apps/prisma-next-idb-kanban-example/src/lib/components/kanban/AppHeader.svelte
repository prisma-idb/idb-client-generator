<script lang="ts">
  import { getContext } from "svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { LayoutDashboardIcon } from "@lucide/svelte";
  import { KANBAN_CTX, type KanbanStore } from "$lib/stores/kanban.svelte";

  const kanban = getContext<KanbanStore>(KANBAN_CTX);
</script>

<header class="flex flex-col gap-4 border-b pb-4 md:flex-row md:items-end md:justify-between">
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-2">
      <Badge variant="outline" class="border-primary/25 bg-primary/5 text-primary">
        <LayoutDashboardIcon />
        Local IDB
      </Badge>
      <Badge variant={kanban.status === "ready" ? "secondary" : kanban.status === "error" ? "destructive" : "outline"}>
        {kanban.status === "opening" ? "Opening" : kanban.status === "ready" ? "Ready" : "Error"}
      </Badge>
    </div>
    <div>
      <h1 class="text-2xl font-semibold tracking-normal md:text-3xl">Prisma Next IDB Kanban</h1>
      <p class="text-muted-foreground max-w-2xl text-sm">
        Local users, boards, and todos managed directly through the IndexedDB ORM.
      </p>
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
