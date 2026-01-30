import devtoolsJson from "vite-plugin-devtools-json";
import { SvelteKitPWA } from "@vite-pwa/sveltekit";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  define: {
    "process.env.NODE_ENV": process.env.NODE_ENV === "production" ? '"production"' : '"development"',
  },
  plugins: [
    tailwindcss(),
    sveltekit(),
    devtoolsJson(),
    SvelteKitPWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "service-worker.ts",
      devOptions: {
        enabled: true,
        type: "module",
      },
      manifestFilename: "manifest.webmanifest",
    }),
  ],
});
