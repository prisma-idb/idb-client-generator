<script lang="ts">
  import Button from "$lib/components/ui/button/button.svelte";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select/index.js";
  import type { AppState } from "$lib/store.svelte";
  import { toast } from "svelte-sonner";

  type PropsType = {
    appState: AppState;
  };

  let { appState }: PropsType = $props();

  async function handleUserChange(value: string | undefined) {
    if (!appState.client || !value) return;
    try {
      await appState.selectUser(value);
      appState.activeTab = "todos";
    } catch {
      toast.error("Failed to select user");
    }
  }

  async function handleCreateUser(e: SubmitEvent) {
    e.preventDefault();
    try {
      await appState.createUser(appState.newUserName);
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
          value={appState.newUserName}
          onchange={(e) => (appState.newUserName = (e.target as HTMLInputElement).value)}
          disabled={appState.isCreatingUser || !appState.client}
          class="w-full"
        />
      </div>
      <Button type="submit" disabled={appState.isCreatingUser || !appState.client || !appState.newUserName.trim()}>
        {appState.isCreatingUser ? "Creating..." : "Create"}
      </Button>
    </form>
  </div>

  <!-- Select User -->
  <div class="rounded-lg border p-6">
    <h2 class="mb-4 text-lg font-semibold">Select a User</h2>
    {#if appState.allUsers.length > 0}
      <div class="space-y-4">
        {#if appState.currentUser}
          <div class="rounded-lg bg-muted/50 p-4">
            <p class="text-sm text-muted-foreground">Currently selected</p>
            <p class="mt-1 font-semibold">{appState.currentUser.name}</p>
            <p class="mt-1 text-xs text-muted-foreground">{appState.currentUser.id}</p>
          </div>
        {/if}

        <div>
          <Label for="user-select" class="mb-2 block text-sm font-medium">Choose user</Label>
          <Select.Root
            type="single"
            value={appState.userId}
            onValueChange={(value: string | undefined) => {
              if (value) handleUserChange(value);
            }}
            disabled={!appState.client}
          >
            <Select.Trigger id="user-select" class="w-full">
              {appState.currentUser?.name || "Select a user"}
            </Select.Trigger>
            <Select.Content>
              <Select.Group>
                {#each appState.allUsers as user (user.id)}
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
