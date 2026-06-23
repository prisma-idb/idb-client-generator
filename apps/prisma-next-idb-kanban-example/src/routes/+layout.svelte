<script lang="ts">
  import "./layout.css";

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href="/icons/icon-192x192.png" type="image/png" />
  <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta name="theme-color" content="#ff8500" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-title" content="Prisma Kanban" />
</svelte:head>
{@render children()}
