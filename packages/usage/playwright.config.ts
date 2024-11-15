import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
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
    command: "npx prisma db push --force-reset && npm run build && npm run preview",
    port: 4173,
    reuseExistingServer: false,
  },
});
