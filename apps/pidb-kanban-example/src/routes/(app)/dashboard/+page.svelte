<script lang="ts">
  import { getTodosContext } from "../todos-state.svelte";
  import BoardCard from "./components/board-card.svelte";
  import BoardDialog from "./components/board-dialog.svelte";
  import TodoDialog from "./components/todo-dialog.svelte";

  const todosState = getTodosContext();
</script>

<svelte:head>
  <title>Dashboard - Prisma IDB Kanban</title>
  <meta name="description" content="Manage your Kanban boards with offline-first IndexedDB synchronization." />
</svelte:head>

{#each todosState.boards as board (board.id)}
  <BoardCard {board} />
{/each}

<BoardDialog />
<TodoDialog />
