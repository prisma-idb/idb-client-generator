import { prisma } from "$lib/prisma";
import type { Prisma } from "@prisma/client";
import { test, expect } from "../fixtures";

test("equals_NullableStringField_ReturnsFilteredRecords", async ({ page }) => {
  const createQuery: Prisma.UserCreateArgs = { data: { name: "Alice" } };
  await prisma.user.create(createQuery);
  await page.getByTestId("query-input").fill(`user.create(${JSON.stringify(createQuery)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status")).toContainText("Query executed successfully");

  const createQuery2: Prisma.UserCreateArgs = { data: { name: "John", profile: { create: { bio: "John's bio" } } } };
  await prisma.user.create(createQuery2);
  await page.getByTestId("query-input").fill(`user.create(${JSON.stringify(createQuery2)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status").nth(1)).toContainText("Query executed successfully");

  const profileFindQuery: Prisma.ProfileFindManyArgs = { where: { bio: { equals: null } } };
  await prisma.profile.findMany(profileFindQuery);
  await page.getByTestId("query-input").fill(`profile.findMany(${JSON.stringify(profileFindQuery)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status").nth(2)).toContainText("Query executed successfully");

  const profileFindQuery2: Prisma.ProfileFindManyArgs = { where: { bio: { equals: "John's bio" } } };
  await prisma.profile.findMany(profileFindQuery2);
  await page.getByTestId("query-input").fill(`profile.findMany(${JSON.stringify(profileFindQuery2)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status").nth(3)).toContainText("Query executed successfully");
});

test("equals_IntField_ReturnsFilteredRecords", async ({ page }) => {
  const createQuery: Prisma.UserCreateArgs = { data: { name: "Alice", id: 3 } };
  await prisma.user.create(createQuery);
  await page.getByTestId("query-input").fill(`user.create(${JSON.stringify(createQuery)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status")).toContainText("Query executed successfully");

  const createQuery2: Prisma.UserCreateArgs = { data: { name: "John", id: 5 } };
  await prisma.user.create(createQuery2);
  await page.getByTestId("query-input").fill(`user.create(${JSON.stringify(createQuery2)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status").nth(1)).toContainText("Query executed successfully");

  const userFindQuery: Prisma.UserFindManyArgs = { where: { id: { equals: 3 } } };
  await prisma.user.findMany(userFindQuery);
  await page.getByTestId("query-input").fill(`user.findMany(${JSON.stringify(userFindQuery)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status").nth(2)).toContainText("Query executed successfully");

  const userFindQuery2: Prisma.UserFindManyArgs = { where: { id: { equals: 1 } } };
  await prisma.user.findMany(userFindQuery2);
  await page.getByTestId("query-input").fill(`user.findMany(${JSON.stringify(userFindQuery2)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status").nth(3)).toContainText("Query executed successfully");
});
