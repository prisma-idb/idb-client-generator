/// <reference no-default-lib="true"/>
/// <reference types="@vite-pwa/sveltekit" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { StaleWhileRevalidate, NetworkOnly } from "workbox-strategies";
declare let self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST, { ignoreURLParametersMatching: [/.*/] });

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Don't cache API endpoints - always fetch fresh
registerRoute(({ request }) => {
  const url = new URL(request.url);
  return url.pathname.startsWith("/api/");
}, new NetworkOnly());

// Cache everything else
registerRoute(/.*/, new StaleWhileRevalidate());
