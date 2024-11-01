import { test, expect } from "@playwright/test";

test("Test create", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Enter Task").click();
  await page.getByPlaceholder("Enter Task").fill("finish assignments");
  await page.getByRole("button", { name: "Add Task" }).click();
  await expect(page.getByRole("cell", { name: "finish assignments" })).toBeVisible();
});

test("Test Read", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Enter Task").click();
  await page.getByPlaceholder("Enter Task").fill("test read");
  await page.getByRole("button", { name: "Add Task" }).click();
  await page.getByRole("cell", { name: "test read" }).click();
  await expect(page.locator("tbody")).toContainText("test read");
  await page.locator("td").nth(2).click();
});

test("Test Update", async ({ page }) => {
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

test("test", async ({ page }) => {
  await page.goto("http://localhost:5173/");
  await page.getByPlaceholder("Enter Task").click();
  await page.getByPlaceholder("Enter Task").fill("test update");
  await page.getByRole("button", { name: "Add Task" }).click();
  await page.getByRole("cell", { name: "test update" }).click();
  await page.locator("td").nth(2).click();
  await page.getByRole("button", { name: "Delete Task" }).click();
  await expect(page.locator("body")).toContainText(
    "Prisma-IDB usage page Add Task Completed Tasks: 0 Task Id Task Status Actions",
  );
});
