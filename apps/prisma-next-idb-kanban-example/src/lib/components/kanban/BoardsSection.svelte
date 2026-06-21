<script lang="ts">
  import { getContext } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { ClipboardListIcon, LayoutDashboardIcon, PlusIcon, UsersIcon } from "@lucide/svelte";
  import { KANBAN_CTX, type KanbanStore } from "$lib/stores/kanban.svelte";
  import BoardCard from "./BoardCard.svelte";

  const kanban = getContext<KanbanStore>(KANBAN_CTX);

  let newBoardName = $state("");

  async function createBoard(event: Event) {
    event.preventDefault();
    const name = newBoardName.trim() || `Board ${kanban.boards.length + 1}`;
    await kanban.createBoard(name);
    newBoardName = "";
  }
</script>

<section class="flex min-w-0 flex-col gap-4">
  <div class="flex flex-col gap-3 rounded-md border bg-card p-3 md:flex-row md:items-center md:justify-between">
    <div>
      <div class="flex items-center gap-2 text-sm font-medium">
        <ClipboardListIcon class="size-4 text-primary" />
        {kanban.activeUser ? `${kanban.activeUser.name}'s boards` : "Create a user to start"}
      </div>
      <p class="text-muted-foreground text-xs">Boards and todos are stored locally in IndexedDB.</p>
    </div>

    <form class="flex w-full gap-2 md:w-auto" onsubmit={createBoard}>
      <Input
        class="md:w-64"
        bind:value={newBoardName}
        placeholder={kanban.activeUser ? "New board name" : "Select a user first"}
        disabled={!kanban.activeUser || kanban.busy}
      />
      <Button type="submit" disabled={!kanban.activeUser || kanban.busy}>
        <PlusIcon />
        Board
      </Button>
    </form>
  </div>

  {#if kanban.activeUser && kanban.boards.length === 0}
    <div class="grid min-h-80 place-items-center rounded-md border border-dashed bg-card/70 p-6 text-center">
      <div class="max-w-sm space-y-2">
        <div class="mx-auto grid size-10 place-items-center rounded-md bg-secondary">
          <LayoutDashboardIcon class="size-5 text-primary" />
        </div>
        <h2 class="font-semibold">No boards yet</h2>
        <p class="text-muted-foreground text-sm">Create a board above, then add todos inside it.</p>
      </div>
    </div>
  {:else if !kanban.activeUser}
    <div class="grid min-h-80 place-items-center rounded-md border border-dashed bg-card/70 p-6 text-center">
      <div class="max-w-sm space-y-2">
        <div class="mx-auto grid size-10 place-items-center rounded-md bg-secondary">
          <UsersIcon class="size-5 text-primary" />
        </div>
        <h2 class="font-semibold">Start with a local user</h2>
        <p class="text-muted-foreground text-sm">
          The prisma-next version skips auth, so users are created directly in the local ORM.
        </p>
      </div>
    </div>
  {:else}
    <div class="grid auto-cols-[minmax(280px,360px)] grid-flow-col gap-3 overflow-x-auto pb-3">
      {#each kanban.boards as board (board.id)}
        <BoardCard {board} />
      {/each}
    </div>
  {/if}
</section>
