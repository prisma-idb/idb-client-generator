import { prisma } from "$lib/prisma";
import { test, expect } from "../fixtures";
import type { Prisma } from "@prisma/client";

test("create_NestedCreateTransactionFailsOnError_RollsBackChanges", async ({ page }) => {
  const query: Prisma.UserCreateArgs = {
    data: { id: 1, name: "Alice with bio", profile: { create: { bio: "generic bio" } } },
  };
  // Create test user with profile
  await prisma.user.create(query);
  await page.getByTestId("query-input").fill(`user.create(${JSON.stringify(query)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status")).toContainText("Query executed successfully");

  // Repeat with same IDs (should fail)
  const query2: Prisma.UserCreateArgs = {
    data: { id: 1, name: "Alice with bio", profile: { create: { bio: "generic bio" } } },
  };
  await expect(prisma.user.create(query2)).rejects.toThrow();

  await page.getByTestId("query-input").fill(`user.create(${JSON.stringify(query2)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(
    page.getByRole("status").filter({
      hasText:
        "Unable to add key to index 'userIdIndex': at least one key does not satisfy the uniqueness requirements.",
    }),
  ).toBeVisible();

  const userCount = await prisma.user.count();
  expect(userCount).toBe(1);
  await page.getByTestId("query-input").fill(`user.count()`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status").nth(2)).toContainText("Query executed successfully");
  const idbClientOutput = (await page.getByRole("code").textContent()) ?? "";
  expect(JSON.parse(idbClientOutput)).toEqual(userCount);

  const profileCount = await prisma.profile.count();
  expect(profileCount).toBe(1);
  await page.getByTestId("query-input").fill(`profile.count()`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status").nth(3)).toContainText("Query executed successfully");
  const idbClientOutput2 = (await page.getByRole("code").textContent()) ?? "";
  expect(JSON.parse(idbClientOutput2)).toEqual(profileCount);
});

test("create_WithOneToOneRelationMetaOnNested_SuccessfullyCreatesBothEntities", async ({ page }) => {
  const query: Prisma.UserCreateArgs = {
    data: { name: "Alice with bio", profile: { create: { bio: "generic bio" } } },
  };
  const result = await prisma.user.create(query);

  await page.getByTestId("query-input").fill(`user.create(${JSON.stringify(query)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status")).toContainText("Query executed successfully");

  const idbClientOutput = (await page.getByRole("code").textContent()) ?? "";
  expect(JSON.parse(idbClientOutput)).toEqual(result);

  const query2: Prisma.ProfileFindUniqueArgs = { where: { id: 1 } };
  const result2 = await prisma.profile.findUnique(query2);

  await page.getByTestId("query-input").fill(`profile.findUnique(${JSON.stringify(query2)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status").nth(1)).toContainText("Query executed successfully");

  const idbClientOutput2 = (await page.getByRole("code").textContent()) ?? "";
  expect(JSON.parse(idbClientOutput2)).toEqual(result2);
});

test("create_WithOneToOneRelationMetaOnParent_SuccessfullyCreatesBothEntities", async ({ page }) => {
  // TODO
});

test("create_WithOneToManyRelation_CreatesParentAndChildRecords", async ({ page }) => {
  // TODO
});

test("create_WithManyToManyRelation_CreatesJoinRecords", async ({ page }) => {
  // TODO
});

test("create_WithDeeplyNestedRelations_PersistsAllEntities", async ({ page }) => {
  // TODO
});
