import { browser, dev } from "$app/environment";
import { initializeClient } from "$lib/clients/idb-client";
import { injectAnalytics } from "@vercel/analytics/sveltekit";

injectAnalytics({ mode: dev ? "development" : "production" });

export const prerender = true;

export async function load() {
  if (browser) await initializeClient();
}
