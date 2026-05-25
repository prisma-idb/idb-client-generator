<script lang="ts">
  import { onMount } from "svelte";
  import { UsersState } from "$lib/prisma/users.svelte";
  import { Alert, AlertDescription, AlertTitle } from "$lib/components/ui/alert";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Separator } from "$lib/components/ui/separator";
  import type { PageData } from "./$types";
  import { resolve } from "$app/paths";

  let { data }: { data: PageData } = $props();

  const users = new UsersState(data.contract);

  let name = $state("");
  let email = $state("");
  let submitting = $state(false);

  onMount(() => users.load());

  async function addUser(event: SubmitEvent) {
    event.preventDefault();
    submitting = true;
    try {
      await users.create(name.trim(), email.trim());
      name = "";
      email = "";
    } finally {
      submitting = false;
    }
  }
</script>

<main class="mx-auto max-w-2xl space-y-8 px-4 py-12">
  <div>
    <h1 class="text-3xl font-bold">Users</h1>
    <p class="text-muted-foreground mt-1 text-sm">Manage users stored in IndexedDB via prisma-next-idb.</p>
  </div>

  <Card>
    <CardHeader>
      <CardTitle>Add user</CardTitle>
    </CardHeader>
    <CardContent>
      <form id="add-user" onsubmit={addUser} class="grid grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <Label for="name">Name</Label>
          <Input id="name" bind:value={name} placeholder="Alice" required />
        </div>
        <div class="space-y-1.5">
          <Label for="email">Email</Label>
          <Input id="email" type="email" bind:value={email} placeholder="alice@example.com" required />
        </div>
      </form>
    </CardContent>
    <CardFooter>
      <Button type="submit" form="add-user" disabled={submitting}>
        {submitting ? "Adding…" : "Add user"}
      </Button>
    </CardFooter>
  </Card>

  {#if users.error}
    <Alert variant="destructive">
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>{users.error}</AlertDescription>
    </Alert>
  {/if}

  <div class="space-y-3">
    <div class="flex items-center gap-2">
      <h2 class="text-xl font-semibold">All users</h2>
      <Badge variant="secondary">{users.users.length}</Badge>
    </div>
    <Separator />

    {#if users.loading}
      <p class="text-muted-foreground text-sm">Loading…</p>
    {:else if users.users.length === 0}
      <p class="text-muted-foreground text-sm">No users yet.</p>
    {:else}
      <div class="space-y-2">
        {#each users.users as user (user.id)}
          <Card>
            <CardContent class="flex items-center justify-between py-4">
              <a href={resolve(`/users/${user.id}`)} class="group flex-1">
                <p class="font-medium group-hover:underline">{user.name}</p>
                <p class="text-muted-foreground text-sm">{user.email}</p>
              </a>
              <Button variant="ghost" size="sm" onclick={() => users.remove(user.id)}>Delete</Button>
            </CardContent>
          </Card>
        {/each}
      </div>
    {/if}
  </div>
</main>
