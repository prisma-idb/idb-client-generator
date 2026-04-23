/// <reference types="node" />

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : 4,
  reporter: "html",
  globalSetup: "./tests/global-setup.ts",
  use: { trace: "on-first-retry", video: "retain-on-failure" },
  projects: [
    // Can only use one or we get race conditions
    /*
      Example: user.create({ name: "John" }) in two projects but one database
      The projects each will generate { id: 1 } as key, but the database will 
      have { id: 1 } and { id: 2 }, causing one project's test to fail
    */
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },

    // { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    // { name: "webkit", use: { ...devices["Desktop Safari"] } },
    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  webServer: {
    command: "pnpm build && pnpm preview",
    port: 4174,
    reuseExistingServer: false,
  },
});
