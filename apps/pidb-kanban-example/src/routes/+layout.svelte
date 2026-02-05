<script lang="ts">
  import { browser } from "$app/environment";
  import favicon from "$lib/assets/favicon.png";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import { QueryClient, QueryClientProvider } from "@tanstack/svelte-query";
  import { ModeWatcher } from "mode-watcher";
  import "./layout.css";
  import PwaButton from "./components/pwa-button.svelte";

  let { children } = $props();

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        enabled: browser,
      },
    },
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <link rel="manifest" href="manifest.webmanifest" />
</svelte:head>

<ModeWatcher />
<Toaster />
<PwaButton />

<QueryClientProvider client={queryClient}>
  {@render children()}
</QueryClientProvider>
