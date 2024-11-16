import { test, expect } from "@playwright/test";
import { PrismaClient, type Prisma } from "@prisma/client";

const client = new PrismaClient();

test.beforeEach(async ({ page }) => {
  await client.user.deleteMany();
  await client.$executeRaw`ALTER SEQUENCE "User_id_seq" RESTART WITH 1`;
  await page.goto("/");
});

test("create user", async ({ page }) => {
  const createQuery: Prisma.UserCreateArgs = { data: { name: "John Doe" } };
  const result = await client.user.create(createQuery);

  await page.getByTestId("query-input").fill(`user.create(${JSON.stringify(createQuery)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status")).toContainText("Query executed successfully");

  const idbClientOutput = (await page.getByRole("code").textContent()) ?? "";
  expect(JSON.parse(idbClientOutput)).toEqual(result);
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
