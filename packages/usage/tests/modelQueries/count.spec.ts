import { prisma } from "$lib/prisma";
import type { Prisma } from "@prisma/client";
import { test, expect } from "../fixtures";

test("count_WithoutFilters_ReturnsTotalCount", async ({ page }) => {
  const output = await prisma.user.count();
  expect(output).toBe(0);
  await page.getByTestId("query-input").fill(`user.count()`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status")).toContainText("Query executed successfully");
  const idbClientOutput = (await page.getByRole("code").textContent()) ?? "";
  expect(JSON.parse(idbClientOutput)).toEqual(output);

  const createQuery: Prisma.UserCreateArgs = { data: { name: "John Doe" } };
  await prisma.user.create(createQuery);
  await page.getByTestId("query-input").fill(`user.create(${JSON.stringify(createQuery)})`);
  await page.getByRole("button", { name: "Run query" }).click();

  const output2 = await prisma.user.count();
  expect(output2).toBe(1);
  await page.getByTestId("query-input").fill(`user.count()`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status").nth(2)).toContainText("Query executed successfully");
  const idbClientOutput2 = (await page.getByRole("code").textContent()) ?? "";
  expect(JSON.parse(idbClientOutput2)).toEqual(output2);
});

test("count_WithSelect_ReturnsSelectedFieldsOnly", async ({ page }) => {
  // TODO
});
