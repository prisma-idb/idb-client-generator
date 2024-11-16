import { prisma } from "$lib/prisma";
import type { Prisma } from "@prisma/client";
import { expect, test } from "../fixtures";

test("findFirstOrThrow_NoMatchingRecords_ThrowsError", async ({ page }) => {
  expect(prisma.user.findFirstOrThrow()).rejects.toThrowError();
  await page.getByTestId("query-input").fill(`user.findFirstOrThrow()`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status")).toContainText("Record not found");
});

test("findFirstOrThrow_ValidQuery_ReturnsFirstRecord", async ({ page }) => {
  const query: Prisma.UserCreateArgs = { data: { name: "John" } };
  await prisma.user.create(query);
  await page.getByTestId("query-input").fill(`user.create(${JSON.stringify(query)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status")).toContainText("Query executed successfully");

  const result = await prisma.user.findFirstOrThrow();
  await page.getByTestId("query-input").fill(`user.findFirstOrThrow()`);
  await page.getByRole("button", { name: "Run query" }).click();
  const idbClientOutput = (await page.getByRole("code").textContent()) ?? "";
  await expect(JSON.parse(idbClientOutput)).toEqual(result);
});
