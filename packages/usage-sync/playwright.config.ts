import { defineConfig } from "@playwright/test";

export default defineConfig({
  webServer: {
    command: "pnpm exec prisma generate && pnpm exec prisma db push --accept-data-loss && pnpm build && pnpm preview",
    port: 4173,
  },
  testDir: "tests",
  reporter: "html",
  use: { trace: "on-first-retry", video: "retain-on-failure" },
});
