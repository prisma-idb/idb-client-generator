import { test } from "@playwright/test";

test("test", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Enter Task").click();
  await page.getByPlaceholder("Enter Task").fill("finish assignments");
});
