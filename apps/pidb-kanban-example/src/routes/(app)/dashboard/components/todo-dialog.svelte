<script lang="ts">
  import { client } from "$lib/clients/idb-client";
  import Button from "$lib/components/ui/button/button.svelte";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import Input from "$lib/components/ui/input/input.svelte";
  import Label from "$lib/components/ui/label/label.svelte";
  import type { Board, Todo } from "$lib/generated/prisma/client";
  import { PencilIcon } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import { getTodosContext } from "../../todos-state.svelte";

  type Props = {
    board: Board;
    open: boolean;
    todo?: Todo;
    action: "create" | "edit";
  };

  let { open = $bindable(false), todo, action = $bindable("create"), board }: Props = $props();

  const todosState = getTodosContext();

  let newTitle = $derived(todo?.title || "");
  let newDescription = $derived(todo?.description || "");

  async function updateTodo() {
    if (!todo) return;

    await client.todo.update({
      where: { id: todo.id },
      data: { title: newTitle, description: newDescription },
    });

    toast.success("Todo updated successfully");
    open = false;
  }

  async function createTodo() {
    await todosState.addTodoToBoard(board.id, newTitle, newDescription);

    toast.success("Todo created successfully");
    open = false;
  }

  async function onSubmit(event: Event) {
    event.preventDefault();
    try {
      if (action === "edit") await updateTodo();
      else await createTodo();
    } catch (error) {
      toast.error("An error occurred while saving the todo");
      console.error("Error in onSubmit:", error);
    }
    open = false;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>
        {#if action === "edit"}
          Update todo <span class="italic">{todo?.title}</span>&nbsp;?
        {:else}
          Create new todo for board <span class="italic">{board.name}</span>
        {/if}
      </Dialog.Title>
    </Dialog.Header>
    <form class="contents" onsubmit={onSubmit}>
      <Label class="flex flex-col items-start gap-2">
        New todo title
        <Input
          bind:value={newTitle}
          required
          data-testid={action === "edit" ? `update-todo-${todo?.title}-input` : "create-todo-title-input"}
        />
      </Label>
      <Label class="mt-4 flex flex-col items-start gap-2">
        New todo description
        <Input
          bind:value={newDescription}
          data-testid={action === "edit"
            ? `update-todo-${todo?.title}-description-input`
            : "create-todo-description-input"}
        />
      </Label>
      <Button
        class="ml-auto"
        type="submit"
        data-testid={action === "edit" ? `update-todo-${todo?.title}-submit` : "create-todo-submit"}
      >
        {action === "edit" ? "Update" : "Create"}
        <PencilIcon />
      </Button>
    </form>
  </Dialog.Content>
</Dialog.Root>
