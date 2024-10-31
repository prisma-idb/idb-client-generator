import { test, expect } from "@playwright/test";

test("test", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add Task" }).click();
  await page.getByRole("button", { name: "Add Task" }).dblclick();
  await expect(page.getByRole("button", { name: "Add Task" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Add Task");
});
