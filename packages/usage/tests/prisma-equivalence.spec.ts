import { test, expect } from "@playwright/test";
import { PrismaClient, type Prisma } from "@prisma/client";

function jsonStringsAreEqual(jsonStr1: string, jsonStr2: string) {
  const obj1 = JSON.parse(jsonStr1);
  const obj2 = JSON.parse(jsonStr2);
  return JSON.stringify(obj1, Object.keys(obj1).sort()) === JSON.stringify(obj2, Object.keys(obj2).sort());
}

const client = new PrismaClient();

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("create user", async ({ page }) => {
  const createQuery: Prisma.UserCreateArgs = { data: { name: "John Doe" } };
  const result = await client.user.create({ data: { name: "John Doe" } });

  await page.getByTestId("query-input").fill(`user.create(${JSON.stringify(createQuery)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status")).toContainText("Query executed successfully");

  const areResultsEqual = jsonStringsAreEqual(
    (await page.getByRole("code").textContent()) ?? "",
    JSON.stringify(result),
  );
  expect(areResultsEqual).toBe(true);
});
