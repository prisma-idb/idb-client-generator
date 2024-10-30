import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("has title", async ({ page }) => {
  await expect(page.getByRole("heading")).toContainText("Prisma-IDB usage page");
});
