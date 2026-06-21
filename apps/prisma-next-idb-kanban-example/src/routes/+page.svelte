<script lang="ts">
  import { setContext, onMount } from "svelte";
  import { LoaderCircleIcon } from "@lucide/svelte";
  import { KanbanStore, KANBAN_CTX } from "$lib/stores/kanban.svelte";
  import AppHeader from "$lib/components/kanban/AppHeader.svelte";
  import UserSidebar from "$lib/components/kanban/UserSidebar.svelte";
  import BoardsSection from "$lib/components/kanban/BoardsSection.svelte";

  const kanban = new KanbanStore();
  setContext(KANBAN_CTX, kanban);

  onMount(() => {
    kanban.loadWorkspace().catch(kanban.showError);
  });
</script>

<svelte:head>
  <title>Prisma Next IDB Kanban</title>
  <meta name="description" content="Local kanban board backed directly by the prisma-next IndexedDB ORM." />
</svelte:head>

<main class="min-h-svh">
  <section class="mx-auto flex min-h-svh w-full max-w-[1500px] flex-col gap-5 px-4 py-4 md:px-6 lg:px-8">
    <AppHeader />

    {#if kanban.status === "opening"}
      <div class="grid min-h-80 place-items-center rounded-md border border-dashed bg-card/60">
        <div class="text-muted-foreground flex items-center gap-2 text-sm">
          <LoaderCircleIcon class="size-4 animate-spin" />
          Opening IndexedDB
        </div>
      </div>
    {:else}
      {#if kanban.errorMessage}
        <div class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {kanban.errorMessage}
        </div>
      {/if}

      <div class="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside class="flex flex-col gap-4">
          <UserSidebar />
        </aside>
        <BoardsSection />
      </div>
    {/if}
  </section>
</main>
