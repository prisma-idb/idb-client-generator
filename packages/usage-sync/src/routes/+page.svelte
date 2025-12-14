<script lang="ts">
  import Button from "$lib/components/ui/button/button.svelte";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select/index.js";
  import type { Prisma } from "$lib/generated/prisma/client";
  import type { AppliedResult, SyncWorker } from "$lib/prisma-idb/client/idb-interface";
  import { PrismaIDBClient } from "$lib/prisma-idb/client/prisma-idb-client";
  import { CheckCircle2, Circle, Trash2 } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  let client = $state<PrismaIDBClient>();
  let userId = $state<string>();
  let currentUser = $state<Prisma.UserGetPayload<{ select: { id: true; name: true } }> | null>(null);
  let allUsers = $state<Prisma.UserGetPayload<{ select: { id: true; name: true } }>[]>([]);
  let todos = $state<Prisma.TodoGetPayload<{ select: { id: true; title: true; completed: true } }>[]>([]);
  let newTodoTitle = $state("");
  let isLoading = $state(false);
  let syncWorker = $state<SyncWorker | null>(null);
  let syncStats = $state<{ unsynced: number; failed: number; lastError?: string }>({ unsynced: 0, failed: 0 });
  let showSyncDetails = $state(false);
  let clearingSynced = $state(false);

  onMount(async () => {
    client = await PrismaIDBClient.createClient();
    await loadAllUsers();
    await loadCurrentUser();
    await loadTodos();
    await loadSyncStats();

    // Subscribe to todo changes
    client.todo.subscribe(["create", "delete", "update"], async () => {
      await loadTodos();
      await loadSyncStats();
    });

    // Subscribe to user changes
    client.user.subscribe(["create", "update", "delete"], async () => {
      await loadAllUsers();
      await loadCurrentUser();
      await loadSyncStats();
    });
  });

  async function loadSyncStats() {
    if (!client) return;
    try {
      syncStats = await client.$outbox.stats();
    } catch (error) {
      console.error("Error loading sync stats:", error);
    }
  }

  function stopSync() {
    if (syncWorker) {
      syncWorker.stop();
      syncWorker = null;
      toast.success("Sync stopped");
    }
  }

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
    if (!userId) {
      toast.error("No user selected");
      return;
    }
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
    const newUserId = (value);
    userId = newUserId;
    await loadCurrentUser();
    await loadTodos();
  }

  async function syncWithServer() {
    if (!client) return;
    try {
      isLoading = true;

      // Stop any existing sync worker
      if (syncWorker) {
        syncWorker.stop();
      }

      syncWorker = client.createSyncWorker({
        syncHandler: async (events) => {
          console.log("Syncing batch of events:", events);
          try {
            // Send all events in a single batch to maintain ordering and avoid FK constraint violations
            const response = await fetch("/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ events }),
            });

            if (!response.ok) {
              return events.map((event) => ({
                id: event.id,
                error: `Server error: ${response.statusText}`,
              }));
            }

            const serverResults = await response.json();

            return serverResults.map(
              (serverResult: {
                id: string;
                entityId?: string;
                mergedRecord?: Record<string, unknown>;
                serverVersion?: number;
                error?: string | null;
              }) => {
                const event = events.find((e) => e.id === serverResult.id);
                const result: AppliedResult = {
                  id: serverResult.id,
                  entityId: serverResult.entityId || event?.entityId,
                  mergedRecord: serverResult.mergedRecord,
                  serverVersion: serverResult.serverVersion,
                  error: serverResult.error || null,
                };
                console.log(result);
                return result;
              },
            );
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Unknown error";
            return events.map((event) => ({
              id: event.id,
              error: errorMessage,
            }));
          }
        },
        batchSize: 20,
        intervalMs: 8000,
        maxRetries: 5,
      });

      // Start the sync worker - it will begin polling for events
      syncWorker.start();

      toast.success("Sync started! Processing outbox events...");
    } catch (error) {
      console.error("Error starting sync worker:", error);
      toast.error("Failed to start sync worker");
      if (syncWorker) {
        syncWorker.stop();
        syncWorker = null;
      }
    } finally {
      isLoading = false;
    }
  }

  async function clearSyncedEvents() {
    if (!client) return;
    try {
      clearingSynced = true;
      const deletedCount = await client.$outbox.clearSynced({ olderThanDays: 7 });
      await loadSyncStats();
      toast.success(`Cleared ${deletedCount} synced events older than 7 days`);
    } catch (error) {
      console.error("Error clearing synced events:", error);
      toast.error("Failed to clear synced events");
    } finally {
      clearingSynced = false;
    }
  }

  async function retrySyncedFailed() {
    if (!client) return;
    try {
      isLoading = true;
      const batch = await client.$outbox.getNextBatch({ limit: 100 });
      const failedEvents = batch.filter((e) => e.lastError !== null && e.lastError !== undefined);

      if (failedEvents.length === 0) {
        toast.info("No failed events to retry");
        return;
      }

      // Reset tries count for failed events by marking them as unsynced
      const tx = client._db.transaction("OutboxEvent", "readwrite");
      const store = tx.objectStore("OutboxEvent");

      for (const event of failedEvents) {
        await store.put({
          ...event,
          tries: 0,
          lastError: null,
        });
      }

      await tx.done;
      await loadSyncStats();
      toast.success(`Reset ${failedEvents.length} failed events for retry`);

      // Auto-start sync if not already running
      if (!syncWorker) {
        await syncWithServer();
      }
    } catch (error) {
      console.error("Error retrying failed events:", error);
      toast.error("Failed to retry failed events");
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="mx-auto max-w-2xl space-y-8 p-8">
  <div>
    <h1 class="text-3xl font-bold">Todo Manager</h1>
    <p class="text-muted-foreground mt-2">A simple todo app for testing sync functionality</p>
  </div>

  <!-- Current User Section -->
  <div class="bg-muted rounded-lg border p-6 shadow-sm">
    <h2 class="mb-4 text-lg font-semibold">Current User</h2>

    {#if currentUser}
      <div class="mb-4 space-y-3">
        <div class="text-muted-foreground text-sm">
          <span class="font-medium">ID:</span>
          {currentUser.id}
        </div>
        <div class="text-muted-foreground text-sm">
          <span class="font-medium">Name:</span>
          {currentUser.name}
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
            <p class="text-muted-foreground text-sm">No users found</p>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <!-- Add Todo Form -->
  <div class="border-input rounded-lg border p-6 shadow-sm">
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
      <div class="text-muted-foreground flex items-center justify-center py-12">
        <p>No todos yet. Add one to get started!</p>
      </div>
    {:else}
      <div class="space-y-2">
        {#each todos as todo (todo.id)}
          <div
            class="border-input bg-background hover:bg-accent flex items-center gap-3 rounded-md border p-3 transition-colors"
          >
            <!-- Toggle Complete -->
            <button
              type="button"
              onclick={() => toggleTodo(todo.id, todo.completed)}
              class="text-muted-foreground hover:text-primary shrink-0 transition-colors"
              title={todo.completed ? "Mark as incomplete" : "Mark as complete"}
            >
              {#if todo.completed}
                <CheckCircle2 class="text-primary h-5 w-5" />
              {:else}
                <Circle class="h-5 w-5" />
              {/if}
            </button>

            <!-- Title -->
            <div class="flex-1">
              <p class={todo.completed ? "text-muted-foreground line-through" : "text-foreground"}>
                {todo.title}
              </p>
            </div>

            <!-- Delete Button -->
            <button
              type="button"
              onclick={() => deleteTodo(todo.id)}
              class="text-muted-foreground hover:text-destructive shrink-0 transition-colors"
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
    <div class="border-input rounded-lg border p-4 text-center shadow-sm">
      <div class="text-primary text-2xl font-bold">{todos.filter((t) => !t.completed).length}</div>
      <div class="text-muted-foreground text-sm">Active</div>
    </div>
    <div class="border-input rounded-lg border p-4 text-center shadow-sm">
      <div class="text-primary text-2xl font-bold">{todos.filter((t) => t.completed).length}</div>
      <div class="text-muted-foreground text-sm">Completed</div>
    </div>
  </div>

  <!-- Sync Section -->
  <div class="border-input rounded-lg border p-6 shadow-sm">
    <div class="mb-6">
      <h2 class="mb-4 text-lg font-semibold">Sync Control</h2>
      <div class="flex gap-2">
        <Button disabled={!client || isLoading || !!syncWorker} class="flex-1" onclick={syncWithServer}>
          {syncWorker ? "Sync in Progress..." : "Start Sync"}
        </Button>
        {#if syncWorker}
          <Button variant="outline" class="flex-1" onclick={stopSync}>Stop Sync</Button>
        {/if}
      </div>
    </div>

    <!-- Sync Details -->
    <div class="mb-4 space-y-2">
      <button
        type="button"
        class="text-primary hover:text-primary/80 w-full rounded border border-transparent px-2 py-2 text-left text-sm font-medium transition-colors"
        onclick={() => {
          showSyncDetails = !showSyncDetails;
          if (showSyncDetails) {
            loadSyncStats();
          }
        }}
      >
        {showSyncDetails ? "▼" : "▶"} Sync Details
      </button>

      {#if showSyncDetails}
        <div class="border-input mt-3 space-y-3 rounded border p-4">
          <div class="grid grid-cols-3 gap-2">
            <div class="rounded bg-primary/10 p-3 text-center">
              <div class="text-primary text-2xl font-bold">{syncStats.unsynced}</div>
              <div class="text-muted-foreground text-xs">Unsynced</div>
            </div>
            <div class="rounded bg-destructive/10 p-3 text-center">
              <div class="text-destructive text-2xl font-bold">{syncStats.failed}</div>
              <div class="text-muted-foreground text-xs">Failed</div>
            </div>
            <div class="text-muted-foreground rounded bg-muted p-3 text-center">
              <div class="text-sm font-medium">Total</div>
              <div class="text-lg font-bold">{syncStats.unsynced + syncStats.failed}</div>
            </div>
          </div>

          {#if syncStats.lastError}
            <div class="border-destructive/50 bg-destructive/5 rounded border-l-4 border p-3">
              <p class="text-destructive text-xs font-medium">Last Error</p>
              <p class="text-muted-foreground mt-1 break-word text-xs">{syncStats.lastError}</p>
            </div>
          {/if}

          <!-- Additional Options -->
          <div class="border-t pt-3">
            <p class="mb-2 text-xs font-medium text-gray-600">Options</p>
            <div class="space-y-2">
              <Button
                variant="outline"
                disabled={!client || isLoading || syncStats.failed === 0}
                class="w-full text-xs"
                onclick={retrySyncedFailed}
              >
                {isLoading ? "Resetting..." : "Retry Failed Events"}
              </Button>
              <Button
                variant="outline"
                disabled={!client || clearingSynced}
                class="w-full text-xs"
                onclick={clearSyncedEvents}
              >
                {clearingSynced ? "Clearing..." : "Clear Synced (7+ days)"}
              </Button>
              <Button
                variant="outline"
                disabled={!client || isLoading}
                class="w-full text-xs"
                onclick={async () => {
                  if (!client) return;
                  try {
                    isLoading = true;
                    await loadSyncStats();
                    toast.success("Sync stats refreshed");
                  } catch (error) {
                    console.error("Error refreshing stats:", error);
                    toast.error("Failed to refresh stats");
                  } finally {
                    isLoading = false;
                  }
                }}
              >
                Refresh Stats
              </Button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
