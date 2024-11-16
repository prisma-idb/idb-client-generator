import { expect, test } from "@playwright/test";
import { PrismaClient, type Prisma } from "@prisma/client";

const client = new PrismaClient();

test.beforeEach(async ({ page }) => {
  await client.user.deleteMany();
  await client.$executeRaw`ALTER SEQUENCE "User_id_seq" RESTART WITH 1`;
  await page.goto("/");
});

test("create user with profile", async ({ page }) => {
  const query: Prisma.UserCreateArgs = {
    data: { name: "Alice with bio", profile: { create: { bio: "generic bio" } } },
  };
  const result = await client.user.create(query);

  await page.getByTestId("query-input").fill(`user.create(${JSON.stringify(query)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status")).toContainText("Query executed successfully");

  const idbClientOutput = (await page.getByRole("code").textContent()) ?? "";
  expect(JSON.parse(idbClientOutput)).toEqual(result);

  const query2: Prisma.ProfileFindUniqueArgs = { where: { id: 1 } };
  const result2 = await client.profile.findUnique(query2);

  await page.getByTestId("query-input").fill(`profile.findUnique(${JSON.stringify(query2)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status").nth(1)).toContainText("Query executed successfully");

  const idbClientOutput2 = (await page.getByRole("code").textContent()) ?? "";
  expect(JSON.parse(idbClientOutput2)).toEqual(result2);
});

test("test count function", async ({ page }) => {
  const output = await client.user.count();
  expect(output).toBe(0);
  await page.getByTestId("query-input").fill(`user.count()`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status")).toContainText("Query executed successfully");
  const idbClientOutput = (await page.getByRole("code").textContent()) ?? "";
  expect(JSON.parse(idbClientOutput)).toEqual(output);

  const createQuery: Prisma.UserCreateArgs = { data: { name: "John Doe" } };
  await client.user.create(createQuery);
  await page.getByTestId("query-input").fill(`user.create(${JSON.stringify(createQuery)})`);
  await page.getByRole("button", { name: "Run query" }).click();

  const output2 = await client.user.count();
  expect(output2).toBe(1);
  await page.getByTestId("query-input").fill(`user.count()`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status").nth(2)).toContainText("Query executed successfully");
  const idbClientOutput2 = (await page.getByRole("code").textContent()) ?? "";
  expect(JSON.parse(idbClientOutput2)).toEqual(output2);
});

test("test count function with select", async ({ page }) => {
  // TODO
});

test("fail nested create transaction if something goes wrong", async ({ page }) => {
  const query: Prisma.UserCreateArgs = {
    data: { id: 1, name: "Alice with bio", profile: { create: { bio: "generic bio" } } },
  };
  // Create test user with profile
  await client.user.create(query);
  await page.getByTestId("query-input").fill(`user.create(${JSON.stringify(query)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status")).toContainText("Query executed successfully");

  // Repeat with same IDs (should fail)
  const query2: Prisma.UserCreateArgs = {
    data: { id: 1, name: "Alice with bio", profile: { create: { bio: "generic bio" } } },
  };
  await expect(client.user.create(query2)).rejects.toThrow();

  await page.getByTestId("query-input").fill(`user.create(${JSON.stringify(query2)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(
    page.getByRole("status").filter({
      hasText:
        "Unable to add key to index 'userIdIndex': at least one key does not satisfy the uniqueness requirements.",
    }),
  ).toBeVisible();

  const userCount = await client.user.count();
  expect(userCount).toBe(1);
  await page.getByTestId("query-input").fill(`user.count()`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status").nth(2)).toContainText("Query executed successfully");
  const idbClientOutput = (await page.getByRole("code").textContent()) ?? "";
  expect(JSON.parse(idbClientOutput)).toEqual(userCount);

  const profileCount = await client.profile.count();
  expect(profileCount).toBe(1);
  await page.getByTestId("query-input").fill(`profile.count()`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status").nth(3)).toContainText("Query executed successfully");
  const idbClientOutput2 = (await page.getByRole("code").textContent()) ?? "";
  expect(JSON.parse(idbClientOutput2)).toEqual(profileCount);
});
