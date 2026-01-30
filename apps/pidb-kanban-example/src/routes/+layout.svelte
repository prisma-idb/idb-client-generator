<script lang="ts">
  import { browser } from "$app/environment";
  import favicon from "$lib/assets/favicon.png";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import { QueryClient, QueryClientProvider } from "@tanstack/svelte-query";
  import { ModeWatcher } from "mode-watcher";
  import "./layout.css";

  let { children } = $props();

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        enabled: browser,
      },
    },
  });
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<ModeWatcher />
<Toaster />

<QueryClientProvider client={queryClient}>
  {@render children()}
</QueryClientProvider>
