<script lang="ts">
  import { getTodosContext } from "../todos-state.svelte";
  import BoardCard from "./components/board-card.svelte";

  const todosState = getTodosContext();
</script>

{#each todosState.boards as board (board.id)}
  <BoardCard {board} />
{/each}
