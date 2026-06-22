<script lang="ts">
  import { getContext } from "svelte";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { SaveIcon, Trash2Icon, UserPlusIcon, UsersIcon } from "@lucide/svelte";
  import { KANBAN_CTX, type KanbanStore } from "$lib/stores/kanban.svelte";

  const kanban = getContext<KanbanStore>(KANBAN_CTX);

  let newName = $state("");
  let newEmail = $state("");
  let editName = $state("");
  let editEmail = $state("");

  $effect(() => {
    editName = kanban.activeUser?.name ?? "";
    editEmail = kanban.activeUser?.email ?? "";
  });

  async function createUser(event: Event) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    await kanban.createUser(name, newEmail.trim());
    newName = "";
    newEmail = "";
  }

  async function saveUser(event: Event) {
    event.preventDefault();
    const user = kanban.activeUser;
    if (!user) return;
    const name = editName.trim();
    if (!name) return;
    await kanban.updateUser(user.id, name, editEmail.trim());
  }
</script>

<Card.Root class="rounded-md py-4">
  <Card.Header class="px-4">
    <Card.Title class="flex items-center gap-2">
      <UsersIcon class="size-4" />
      Local users
    </Card.Title>
    <Card.Description>Choose a workspace owner or create another local profile.</Card.Description>
  </Card.Header>
  <Card.Content class="space-y-3 px-4">
    <div class="space-y-1.5">
      {#each kanban.users as user (user.id)}
        <Button
          variant={user.id === kanban.activeUserId ? "default" : "outline"}
          class="h-auto w-full justify-start py-2"
          onclick={() => kanban.switchUser(user.id)}
          disabled={kanban.busy}
        >
          <span class="truncate">{user.name}</span>
          {#if user.email}
            <span class="text-xs opacity-70">{user.email}</span>
          {/if}
        </Button>
      {:else}
        <div class="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-sm">
          No local users yet.
        </div>
      {/each}
    </div>

    <form class="space-y-2 border-t pt-3" onsubmit={createUser}>
      <Input bind:value={newName} placeholder="User name" required data-testid="user-name-input" />
      <Input bind:value={newEmail} placeholder="Email, optional" type="email" />
      <Button class="w-full" type="submit" disabled={kanban.busy || !newName.trim()}>
        <UserPlusIcon />
        Create user
      </Button>
    </form>
  </Card.Content>
</Card.Root>

{#if kanban.activeUser}
  {@const user = kanban.activeUser}
  <Card.Root class="rounded-md py-4">
    <Card.Header class="px-4">
      <Card.Title>Manage user</Card.Title>
      <Card.Description>Renaming or deleting this user updates the local store.</Card.Description>
    </Card.Header>
    <Card.Content>
      <form class="space-y-2" onsubmit={saveUser}>
        <Input bind:value={editName} required aria-label="Active user name" />
        <Input bind:value={editEmail} type="email" aria-label="Active user email" />
        <div class="grid grid-cols-2 gap-2">
          <Button type="submit" variant="secondary" disabled={kanban.busy || !editName.trim()}>
            <SaveIcon />
            Save
          </Button>
          <Button type="button" variant="destructive" onclick={() => kanban.deleteUser(user.id)} disabled={kanban.busy}>
            <Trash2Icon />
            Delete
          </Button>
        </div>
      </form>
    </Card.Content>
  </Card.Root>
{/if}
