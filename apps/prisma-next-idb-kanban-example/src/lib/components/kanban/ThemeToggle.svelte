<script lang="ts">
  import { onMount } from "svelte";
  import { MonitorIcon, MoonIcon, SunIcon } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";

  type ThemeMode = "light" | "dark" | "system";

  const STORAGE_KEY = "mode-watcher-mode";
  const LIGHT_THEME_COLOR = "#ff8500";
  const DARK_THEME_COLOR = "#0a0a0a";

  let mode = $state<ThemeMode>("system");
  let mediaQuery: MediaQueryList | null = null;

  function isThemeMode(value: string | null): value is ThemeMode {
    return value === "light" || value === "dark" || value === "system";
  }

  function applyMode(nextMode: ThemeMode) {
    const root = document.documentElement;
    const resolved = nextMode === "system" ? (mediaQuery?.matches ? "dark" : "light") : nextMode;
    const isDark = resolved === "dark";

    root.classList.toggle("dark", isDark);
    root.style.colorScheme = isDark ? "dark" : "light";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", isDark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
    localStorage.setItem(STORAGE_KEY, nextMode);
  }

  function setTheme(nextMode: ThemeMode) {
    mode = nextMode;
    applyMode(nextMode);
  }

  onMount(() => {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mode = isThemeMode(localStorage.getItem(STORAGE_KEY)) ? (localStorage.getItem(STORAGE_KEY) as ThemeMode) : "system";
    applyMode(mode);

    const updateSystemMode = () => {
      if (mode === "system") applyMode("system");
    };

    mediaQuery.addEventListener("change", updateSystemMode);
    return () => mediaQuery?.removeEventListener("change", updateSystemMode);
  });
</script>

<div class="inline-flex rounded-md border bg-card p-0.5 shadow-xs" aria-label="Theme mode">
  <Button
    size="icon-sm"
    variant={mode === "light" ? "default" : "ghost"}
    aria-label="Use light mode"
    aria-pressed={mode === "light"}
    title="Light"
    onclick={() => setTheme("light")}
  >
    <SunIcon />
  </Button>
  <Button
    size="icon-sm"
    variant={mode === "system" ? "default" : "ghost"}
    aria-label="Use system theme"
    aria-pressed={mode === "system"}
    title="System"
    onclick={() => setTheme("system")}
  >
    <MonitorIcon />
  </Button>
  <Button
    size="icon-sm"
    variant={mode === "dark" ? "default" : "ghost"}
    aria-label="Use dark mode"
    aria-pressed={mode === "dark"}
    title="Dark"
    onclick={() => setTheme("dark")}
  >
    <MoonIcon />
  </Button>
</div>
