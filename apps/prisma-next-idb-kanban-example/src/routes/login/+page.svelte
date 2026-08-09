<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { LoaderCircleIcon, UserIcon } from "@lucide/svelte";
  import { authClient } from "$lib/clients/auth-client";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import logo from "$lib/assets/prisma-idb-logo.png";

  let busy = $state(false);
  let errorMessage = $state("");

  const session = authClient.useSession();

  onMount(() => {
    if ($session.data?.user) goto(resolve("/"));
  });

  async function continueAsGuest() {
    busy = true;
    errorMessage = "";
    try {
      const { error } = await authClient.signIn.anonymous();
      if (error) throw new Error(error.message ?? "Failed to sign in anonymously.");
      goto(resolve("/"));
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Failed to sign in anonymously.";
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>Log in | Prisma Next IDB Kanban</title>
</svelte:head>

<main class="grid min-h-svh place-items-center px-4">
  <Card.Root class="w-full max-w-sm">
    <Card.Header class="items-center text-center">
      <img class="mb-2 size-10 object-contain" src={logo} alt="" />
      <Card.Title class="text-xl">Prisma Next IDB Kanban</Card.Title>
      <Card.Description>Sign in to sync your boards and todos across devices.</Card.Description>
    </Card.Header>
    <Card.Content class="space-y-3">
      {#if errorMessage}
        <div class="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
          {errorMessage}
        </div>
      {/if}
      <Button class="w-full" onclick={continueAsGuest} disabled={busy} aria-busy={busy} data-testid="continue-as-guest">
        {#if busy}
          <LoaderCircleIcon class="animate-spin" />
        {:else}
          <UserIcon />
        {/if}
        Continue as guest
      </Button>
      <p class="text-muted-foreground text-center text-xs">
        Guest accounts are anonymous and local to this browser — more sign-in options coming soon.
      </p>
    </Card.Content>
  </Card.Root>
</main>
