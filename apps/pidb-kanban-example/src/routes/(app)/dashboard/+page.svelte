<script lang="ts">
  import { getTodosContext } from "../todos-state.svelte";
  import BoardCard from "./components/board-card.svelte";
  import BoardDialog from "./components/board-dialog.svelte";
  import TodoDialog from "./components/todo-dialog.svelte";

  const todosState = getTodosContext();
</script>

{#each todosState.boards as board (board.id)}
  <BoardCard {board} />
{/each}

<BoardDialog />
<TodoDialog />
