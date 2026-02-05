import devtoolsJson from "vite-plugin-devtools-json";
import { SvelteKitPWA } from "@vite-pwa/sveltekit";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  define: {
    "process.env.NODE_ENV": JSON.stringify(mode),
  },
  plugins: [
    tailwindcss(),
    sveltekit(),
    devtoolsJson(),
    SvelteKitPWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "service-worker.ts",
      includeManifestIcons: false,
      manifest: false,
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
}));
