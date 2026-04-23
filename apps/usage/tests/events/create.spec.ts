import { expect, test } from "../fixtures";
import { expectQueryToSucceed } from "../queryRunnerHelper";

test("createEvent_CreateUser_EmitsCreateEvent", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "EventUser" } },
  });

  await expect(page.locator("pre").first()).toContainText(`{ "keyPath": [ 1 ] }`);
});

test("createEvent_CreateManyUsers_EmitsCreateEvents", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "createMany",
    query: { data: [{ name: "Alice" }, { name: "John" }] },
  });

  await expect(page.locator("pre").first()).toContainText(`{ "keyPath": [ 2 ] }`);
});

test("createEvent_CreateManyAndReturnUsers_EmitsCreateEvents", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "createManyAndReturn",
    query: { data: [{ name: "Alice" }, { name: "John" }] },
  });

  await expect(page.locator("pre").first()).toContainText(`{ "keyPath": [ 2 ] }`);
});

test("createEvent_UpsertUser_EmitsCreateEventWhenCreate", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "upsert",
    query: {
      where: { id: 1 },
      create: { name: "NewUser" },
      update: { name: "UpdatedUser" },
    },
  });

  await expect(page.locator("pre").first()).toContainText(`{ "keyPath": [ 1 ] }`);
});
