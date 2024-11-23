import { prisma } from "$lib/prisma";
import { test, expect } from "../fixtures";
import type { Prisma } from "@prisma/client";

test("createMany_ValidData_SuccessfullyCreatesRecords", async ({ page }) => {
  const createManyQuery: Prisma.UserCreateManyArgs = { data: [{ name: "John Doe" }, { name: "Alice" }] };
  const result = await prisma.user.createMany(createManyQuery);

  await page.getByTestId("query-input").fill(`user.createMany(${JSON.stringify(createManyQuery)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status")).toContainText("Query executed successfully");

  const idbClientOutput = (await page.getByRole("code").textContent()) ?? "";
  expect(JSON.parse(idbClientOutput)).toEqual(result);

  const findResult = await prisma.user.findMany();
  await page.getByTestId("query-input").fill(`user.findMany()`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status").nth(1)).toContainText("Query executed successfully");
  const findClientOutput = (await page.getByRole("code").textContent()) ?? "";
  expect(JSON.parse(findClientOutput)).toEqual(findResult);
});
