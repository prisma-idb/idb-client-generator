<script lang="ts">
  import Button from "$lib/components/ui/button/button.svelte";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select/index.js";
  import type { AppState } from "$lib/store.svelte";
  import { toast } from "svelte-sonner";

  let {
    state,
  }: {
    state: AppState;
  } = $props();

  async function handleUserChange(value: string | undefined) {
    if (!state.client || !value) return;
    try {
      await state.selectUser(value);
      state.activeTab = "todos";
    } catch {
      toast.error("Failed to select user");
    }
  }

  async function handleCreateUser(e: SubmitEvent) {
    e.preventDefault();
    try {
      await state.createUser(state.newUserName);
      toast.success("User created!");
    } catch {
      toast.error("Failed to create user");
    }
  }
</script>

<div class="space-y-4">
  <!-- Create User Form -->
  <div class="rounded-lg border p-6">
    <h2 class="mb-4 text-lg font-semibold">Create New User</h2>
    <form onsubmit={handleCreateUser} class="flex gap-2">
      <div class="flex-1">
        <Input
          type="text"
          placeholder="User name"
          value={state.newUserName}
          onchange={(e) => (state.newUserName = (e.target as HTMLInputElement).value)}
          disabled={state.isCreatingUser || !state.client}
          class="w-full"
        />
      </div>
      <Button type="submit" disabled={state.isCreatingUser || !state.client || !state.newUserName.trim()}>
        {state.isCreatingUser ? "Creating..." : "Create"}
      </Button>
    </form>
  </div>

  <!-- Select User -->
  <div class="rounded-lg border p-6">
    <h2 class="mb-4 text-lg font-semibold">Select a User</h2>
    {#if state.allUsers.length > 0}
      <div class="space-y-4">
        {#if state.currentUser}
          <div class="rounded-lg bg-muted/50 p-4">
            <p class="text-sm text-muted-foreground">Currently selected</p>
            <p class="mt-1 font-semibold">{state.currentUser.name}</p>
            <p class="mt-1 text-xs text-muted-foreground">{state.currentUser.id}</p>
          </div>
        {/if}

        <div>
          <Label for="user-select" class="mb-2 block text-sm font-medium">Choose user</Label>
          <Select.Root
            type="single"
            value={state.userId}
            onValueChange={(value: string | undefined) => {
              if (value) handleUserChange(value);
            }}
            disabled={!state.client}
          >
            <Select.Trigger id="user-select" class="w-full">
              {state.currentUser?.name || "Select a user"}
            </Select.Trigger>
            <Select.Content>
              <Select.Group>
                {#each state.allUsers as user (user.id)}
                  <Select.Item value={user.id.toString()} label={user.name}>
                    {user.name}
                  </Select.Item>
                {/each}
              </Select.Group>
            </Select.Content>
          </Select.Root>
        </div>
      </div>
    {:else}
      <div class="flex items-center justify-center rounded-lg bg-muted/50 py-8">
        <p class="text-sm text-muted-foreground">No users found</p>
      </div>
    {/if}
  </div>
</div>
