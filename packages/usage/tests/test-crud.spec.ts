import { test, expect } from "@playwright/test";

test("should add todo", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Enter Task").click();
  await page.getByPlaceholder("Enter Task").fill("finish assignments");
  await page.getByRole("button", { name: "Add Task" }).click();
  await expect(page.getByRole("cell", { name: "finish assignments" })).toBeVisible();
});

test("should read added todo", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Enter Task").click();
  await page.getByPlaceholder("Enter Task").fill("test read");
  await page.getByRole("button", { name: "Add Task" }).click();
  await page.getByRole("cell", { name: "test read" }).click();
  await expect(page.locator("tbody")).toContainText("test read");
  await page.locator("td").nth(2).click();
});

test("should update added todo", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Enter Task").click();
  await page.getByPlaceholder("Enter Task").fill("test update");
  await page.getByPlaceholder("Enter Task").press("Enter");
  await page.getByRole("button", { name: "Add Task" }).click();
  await expect(page.locator("tbody")).toContainText("test update");
  await page.getByRole("checkbox").check();
  await page.getByRole("checkbox").uncheck();
  await page.getByRole("checkbox").check();
  await expect(page.getByRole("checkbox")).toBeVisible();
});

test("should show total todos", async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Enter Task').click();
  await page.getByPlaceholder('Enter Task').fill('1');
  await page.getByRole('button', { name: 'Add Task' }).click();
  await page.getByRole('checkbox').check();
  await expect(page.locator('body')).toContainText('Completed Tasks: 1');
  await page.getByRole('checkbox').uncheck();
  await expect(page.locator('body')).toContainText('Completed Tasks: 0');
});
