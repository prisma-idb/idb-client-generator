import { test } from "@playwright/test";

test("test", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add Task" }).click();
});
