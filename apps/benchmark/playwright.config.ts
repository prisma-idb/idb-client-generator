import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  fullyParallel: false,
  workers: 1,
  timeout: 12 * 60 * 1000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "html",
  use: {
    baseURL: "http://127.0.0.1:4175",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm build && pnpm exec serve out -l 4175",
    port: 4175,
    reuseExistingServer: false,
  },
});
