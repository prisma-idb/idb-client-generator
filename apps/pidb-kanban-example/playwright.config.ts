import { defineConfig } from "@playwright/test";

export default defineConfig({
  webServer: { command: "pnpm run build && pnpm run preview", port: 4173 },
  testDir: "test",
  use: { baseURL: "http://localhost:4173" },
});
