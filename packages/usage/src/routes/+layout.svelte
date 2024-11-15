<script lang="ts">
  import "../app.css";
  import { Toaster } from "$lib/components/ui/sonner/index.js";

  let { children } = $props();
</script>

<Toaster />

<main class="mx-auto flex h-screen w-full max-w-xl flex-col items-center gap-16 px-4 py-20">
  <h1 class="text-center text-5xl font-bold">Prisma IDB test page</h1>
  {@render children()}
</main>
