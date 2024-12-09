<script lang="ts">
  import "../app.css";
  import { Toaster } from "$lib/components/ui/sonner/index.js";

  let { children } = $props();
</script>

<Toaster />

<main class="mx-auto flex h-screen w-full max-w-xl flex-col items-center gap-16 px-4 py-20">
  <div class="flex items-center gap-2">
    <img src="/favicon.png" alt="@prisma-idb/idb-client-generator logo" class="h-24 w-24" />
    <div class="flex flex-col">
      <h1 class="text-center text-4xl font-extrabold">idb-client-generator</h1>
      <h2 class="text-center text-xl font-bold">Testing page</h2>
    </div>
  </div>
  {@render children()}
</main>
