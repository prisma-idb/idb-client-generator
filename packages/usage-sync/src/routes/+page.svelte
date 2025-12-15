<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs";
  import { createAppState } from "$lib/store.svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import TodosTab from "./components/TodosTab.svelte";
  import UsersTab from "./components/UsersTab.svelte";
  import SyncTab from "./components/SyncTab.svelte";

  const state = createAppState();

  onMount(async () => {
    try {
      await state.initializeClient();
    } catch (error) {
      console.error("Error initializing client:", error);
      toast.error("Failed to initialize app");
    }
  });
</script>

<div class="container max-w-4xl space-y-6 p-8">
  <div>
    <h1 class="text-3xl font-bold">Todo Manager</h1>
    <p class="text-muted-foreground mt-2">Manage users and todos with real-time sync</p>
  </div>

  <Tabs.Root value={state.activeTab} onValueChange={(value) => (state.activeTab = value as "users" | "todos" | "sync")}>
    <Tabs.List class="grid w-full grid-cols-3">
      <Tabs.Trigger value="users">
        Users
        {#if state.allUsers.length > 0}
          <span class="ml-2 text-xs opacity-60">({state.allUsers.length})</span>
        {/if}
      </Tabs.Trigger>
      <Tabs.Trigger value="todos">
        Todos
        {#if state.todos.length > 0}
          <span class="ml-2 text-xs opacity-60">({state.todos.length})</span>
        {/if}
      </Tabs.Trigger>
      <Tabs.Trigger value="sync">
        Sync
        {#if state.syncStats.unsynced + state.syncStats.failed > 0}
          <span class="ml-2 text-xs opacity-60">({state.syncStats.unsynced + state.syncStats.failed})</span>
        {/if}
      </Tabs.Trigger>
    </Tabs.List>

    <!-- Users Tab -->
    <Tabs.Content value="users">
      <UsersTab {state} />
    </Tabs.Content>

    <!-- Todos Tab -->
    <Tabs.Content value="todos">
      <TodosTab {state} />
    </Tabs.Content>

    <!-- Sync Tab -->
    <Tabs.Content value="sync">
      <SyncTab {state} />
    </Tabs.Content>
  </Tabs.Root>
</div>
