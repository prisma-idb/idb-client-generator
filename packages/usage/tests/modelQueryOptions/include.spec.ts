import { prisma } from "$lib/prisma";
import type { Prisma } from "@prisma/client";
import { test, expect } from "../fixtures";

test("include_WithOneToOneRelation_ReturnsRelatedData", async ({ page }) => {
  const createQuery: Prisma.UserCreateArgs = {
    data: { name: "John Doe", profile: { create: { bio: "John's Bio" } } },
  };
  const createOutput = await prisma.user.create(createQuery);
  await page.getByTestId("query-input").fill(`user.create(${JSON.stringify(createQuery)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status")).toContainText("Query executed successfully");
  const idbCreateOutput = (await page.getByRole("code").textContent()) ?? "";
  expect(JSON.parse(idbCreateOutput)).toEqual(createOutput);

  const findWithIncludeQuery: Prisma.UserFindManyArgs = { include: { profile: true } };
  const findWithIncludeOutput = await prisma.user.findMany(findWithIncludeQuery);
  await page.getByTestId("query-input").fill(`user.findMany(${JSON.stringify(findWithIncludeQuery)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status").nth(1)).toContainText("Query executed successfully");
  const idbFindWithIncludeOutput = (await page.getByRole("code").textContent()) ?? "";
  expect(JSON.parse(idbFindWithIncludeOutput)).toEqual(findWithIncludeOutput);
});

// TODO: test for other relation types (one-to-many, one-to-oneMetaOnCurrent, nested includes)
