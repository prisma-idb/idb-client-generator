import { prisma } from "$lib/prisma";
import type { Prisma } from "@prisma/client";
import { test, expect } from "../fixtures";

test("select_WithRelationAndName_ReturnsSelectedData", async ({ page }) => {
  const createQuery: Prisma.UserCreateArgs = {
    data: { name: "John Doe", profile: { create: { bio: "John's Bio" } } },
  };
  const createOutput = await prisma.user.create(createQuery);
  await page.getByTestId("query-input").fill(`user.create(${JSON.stringify(createQuery)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status")).toContainText("Query executed successfully");
  const idbCreateOutput = (await page.getByRole("code").textContent()) ?? "";
  expect(JSON.parse(idbCreateOutput)).toEqual(createOutput);

  const findWithSelectQuery: Prisma.UserFindManyArgs = { select: { profile: true, name: true } };
  const findWithSelectOutput = await prisma.user.findMany(findWithSelectQuery);
  await page.getByTestId("query-input").fill(`user.findMany(${JSON.stringify(findWithSelectQuery)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status").nth(1)).toContainText("Query executed successfully");
  const idbFindWithSelectOutput = (await page.getByRole("code").textContent()) ?? "";
  expect(JSON.parse(idbFindWithSelectOutput)).toEqual(findWithSelectOutput);
});

test("select_WithNestedRelationSelect_ReturnsSelectedData", async ({ page }) => {
  const createQuery: Prisma.UserCreateArgs = {
    data: { name: "John Doe", profile: { create: { bio: "John's Bio" } } },
  };
  const createOutput = await prisma.user.create(createQuery);
  await page.getByTestId("query-input").fill(`user.create(${JSON.stringify(createQuery)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status")).toContainText("Query executed successfully");
  const idbCreateOutput = (await page.getByRole("code").textContent()) ?? "";
  expect(JSON.parse(idbCreateOutput)).toEqual(createOutput);

  const findWithSelectQuery: Prisma.UserFindManyArgs = { select: { profile: { select: { bio: true } }, name: true } };
  const findWithSelectOutput = await prisma.user.findMany(findWithSelectQuery);
  await page.getByTestId("query-input").fill(`user.findMany(${JSON.stringify(findWithSelectQuery)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status").nth(1)).toContainText("Query executed successfully");
  const idbFindWithSelectOutput = (await page.getByRole("code").textContent()) ?? "";
  expect(JSON.parse(idbFindWithSelectOutput)).toEqual(findWithSelectOutput);
});

// TODO: test for other relation types (one-to-many, one-to-oneMetaOnCurrent)

