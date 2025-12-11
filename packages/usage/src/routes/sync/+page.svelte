<script lang="ts">
  import Button from "$lib/components/ui/button/button.svelte";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select/index.js";
  import { PrismaIDBClient } from "../../prisma/prisma-idb/prisma-idb-client";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { Trash2, CheckCircle2, Circle } from "lucide-svelte";
  import type { Prisma } from "$lib/generated/prisma/client";

  let client = $state<PrismaIDBClient>();
  let userId = $state(1);
  let currentUser = $state<Prisma.UserGetPayload<{ select: { id: true; name: true } }> | null>(null);
  let allUsers = $state<Prisma.UserGetPayload<{ select: { id: true; name: true } }>[]>([]);
  let todos = $state<Prisma.TodoGetPayload<{ select: { id: true; title: true; completed: true } }>[]>([]);
  let newTodoTitle = $state("");
  let isLoading = $state(false);

  onMount(async () => {
    client = await PrismaIDBClient.createClient();
    await loadAllUsers();
    await loadCurrentUser();
    await loadTodos();

    // Subscribe to todo changes
    client.todo.subscribe(["create", "delete", "update"], async () => {
      await loadTodos();
    });

    // Subscribe to user changes
    client.user.subscribe(["create", "update", "delete"], async () => {
      await loadAllUsers();
      await loadCurrentUser();
    });
  });

  async function loadAllUsers() {
    if (!client) return;
    try {
      const users = await client.user.findMany({
        select: { id: true, name: true },
      });
      allUsers = users;
    } catch (error) {
      console.error("Error loading users:", error);
    }
  }

  async function loadCurrentUser() {
    if (!client) return;
    try {
      const user = await client.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true },
      });
      currentUser = user;
    } catch (error) {
      console.error("Error loading user:", error);
    }
  }

  async function loadTodos() {
    if (!client) return;
    try {
      const result = await client.todo.findMany({
        where: { userId },
        select: { id: true, title: true, completed: true },
      });
      todos = result;
    } catch (error) {
      console.error("Error loading todos:", error);
      toast.error("Failed to load todos");
    }
  }

  async function addTodo(e: SubmitEvent) {
    e.preventDefault();
    if (!client || !newTodoTitle.trim()) {
      toast.error("Please enter a todo title");
      return;
    }

    isLoading = true;
    try {
      await client.todo.create({
        data: {
          title: newTodoTitle.trim(),
          completed: false,
          userId,
        },
      });
      newTodoTitle = "";
      toast.success("Todo added!");
    } catch (error) {
      console.error("Error adding todo:", error);
      toast.error("Failed to add todo");
    } finally {
      isLoading = false;
    }
  }

  async function toggleTodo(id: string, completed: boolean) {
    if (!client) return;
    try {
      await client.todo.update({
        where: { id },
        data: { completed: !completed },
      });
      toast.success("Todo updated!");
    } catch (error) {
      console.error("Error updating todo:", error);
      toast.error("Failed to update todo");
    }
  }

  async function deleteTodo(id: string) {
    if (!client) return;
    try {
      await client.todo.delete({
        where: { id },
      });
      toast.success("Todo deleted!");
    } catch (error) {
      console.error("Error deleting todo:", error);
      toast.error("Failed to delete todo");
    }
  }

  async function handleUserChange(value: string | undefined) {
    if (!client || !value) return;
    const newUserId = parseInt(value);
    userId = newUserId;
    await loadCurrentUser();
    await loadTodos();
  }
</script>

<div class="mx-auto max-w-2xl space-y-8 p-8">
  <div>
    <h1 class="text-3xl font-bold">Todo Manager</h1>
    <p class="mt-2 text-muted-foreground">A simple todo app for testing sync functionality</p>
  </div>

  <!-- Current User Section -->
  <div class="rounded-lg border bg-muted p-6 shadow-sm">
    <h2 class="mb-4 text-lg font-semibold">Current User</h2>
    
    {#if currentUser}
      <div class="mb-4 space-y-3">
        <div class="text-sm text-muted-foreground">
          <span class="font-medium">ID:</span> {currentUser.id}
        </div>
        <div class="text-sm text-muted-foreground">
          <span class="font-medium">Name:</span> {currentUser.name}
        </div>
        
        <div class="pt-2">
          <Label for="user-select" class="mb-2 block text-sm font-medium">Select User</Label>
          {#if allUsers.length > 0}
            <Select.Root
              type="single"
              value={userId.toString()}
              onValueChange={(value) => {
                if (value) handleUserChange(value);
              }}
              disabled={!client}
            >
              <Select.Trigger class="w-full">
                {currentUser.name}
              </Select.Trigger>
              <Select.Content>
                <Select.Group>
                  {#each allUsers as user (user.id)}
                    <Select.Item value={user.id.toString()} label={user.name}>
                      {user.name}
                    </Select.Item>
                  {/each}
                </Select.Group>
              </Select.Content>
            </Select.Root>
          {:else}
            <p class="text-sm text-muted-foreground">No users found</p>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <!-- Add Todo Form -->
  <div class="rounded-lg border border-input p-6 shadow-sm">
    <form onsubmit={addTodo} class="flex gap-2">
      <div class="flex-1">
        <Label for="new-todo" class="mb-2 block text-sm font-medium">Add a new todo</Label>
        <Input
          id="new-todo"
          type="text"
          placeholder="What needs to be done?"
          bind:value={newTodoTitle}
          disabled={isLoading || !client}
          class="w-full"
        />
      </div>
      <div class="flex items-end">
        <Button type="submit" disabled={isLoading || !client || !newTodoTitle.trim()} class="w-full">
          {isLoading ? "Adding..." : "Add"}
        </Button>
      </div>
    </form>
  </div>

  <!-- Todo List -->
  <div class="rounded-lg border border-gray-200 p-6 shadow-sm">
    <h2 class="mb-4 text-xl font-semibold">Todos ({todos.length})</h2>

    {#if todos.length === 0}
      <div class="flex items-center justify-center py-12 text-muted-foreground">
        <p>No todos yet. Add one to get started!</p>
      </div>
    {:else}
      <div class="space-y-2">
        {#each todos as todo (todo.id)}
          <div
            class="flex items-center gap-3 rounded-md border border-input bg-background p-3 transition-colors hover:bg-accent"
          >
            <!-- Toggle Complete -->
            <button
              type="button"
              onclick={() => toggleTodo(todo.id, todo.completed)}
              class="shrink-0 text-muted-foreground transition-colors hover:text-primary"
              title={todo.completed ? "Mark as incomplete" : "Mark as complete"}
            >
              {#if todo.completed}
                <CheckCircle2 class="h-5 w-5 text-primary" />
              {:else}
                <Circle class="h-5 w-5" />
              {/if}
            </button>

            <!-- Title -->
            <div class="flex-1">
              <p class={todo.completed ? "line-through text-muted-foreground" : "text-foreground"}>
                {todo.title}
              </p>
            </div>

            <!-- Delete Button -->
            <button
              type="button"
              onclick={() => deleteTodo(todo.id)}
              class="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
              title="Delete todo"
            >
              <Trash2 class="h-5 w-5" />
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Stats -->
  <div class="grid grid-cols-2 gap-4">
    <div class="rounded-lg border border-input p-4 text-center shadow-sm">
      <div class="text-2xl font-bold text-primary">{todos.filter((t) => !t.completed).length}</div>
      <div class="text-sm text-muted-foreground">Active</div>
    </div>
    <div class="rounded-lg border border-input p-4 text-center shadow-sm">
      <div class="text-2xl font-bold text-primary">{todos.filter((t) => t.completed).length}</div>
      <div class="text-sm text-muted-foreground">Completed</div>
    </div>
  </div>

  <!-- Sync Section -->
  <div class="rounded-lg border border-input p-6 shadow-sm">
    <h2 class="mb-4 text-lg font-semibold">Sync</h2>
    <Button disabled={!client} class="w-full">
      Sync with Server
    </Button>
  </div>
</div>
