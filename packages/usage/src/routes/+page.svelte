<script lang="ts">
  import { onMount } from "svelte";
  import { PrismaIDBClient } from "$lib/prisma-idb/prisma-idb-client";

  let client: PrismaIDBClient;

  onMount(async () => {
    // Always instantiate on client-side (need IndexedDB)
    client = await PrismaIDBClient.getInstance();
  });
</script>

<main class="prose max-w-full p-4">
  {#if client}
    <h1>Prisma-IDB usage page</h1>
    <p>Database version: <span>{client.db.version}</span></p>
  {:else}
    <h1>Prisma-IDB-client couldn't load</h1>
    <p>Check console for more information</p>
  {/if}
</main>
