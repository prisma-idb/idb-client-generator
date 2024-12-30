import { expect, test } from "../fixtures";
import { expectQueryToSucceed } from "../queryRunnerHelper";

test("updateEvent_UpdateUser_EmitsUpdateEvent", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "NewUser" } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { name: "UpdatedUser" } },
  });

  await expect(page.locator("pre").first()).toContainText(`{ "keyPath": [ 1 ], "oldKeyPath": [ 1 ] }`);
});

test("updateEvent_UpdateManyUsers_EmitsUpdateEvents", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "createMany",
    query: {
      data: [{ name: "User1" }, { name: "User2" }],
    },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "updateMany",
    query: { where: { id: { in: [1, 2] } }, data: { name: "UpdatedUser" } },
  });

  await expect(page.locator("pre").first()).toContainText(`{ "keyPath": [ 2 ], "oldKeyPath": [ 2 ] }`);
});

test("updateEvent_UpsertUser_EmitsUpdateEventWhenUpdating", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: {
      data: { name: "NewUser" },
    },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "upsert",
    query: {
      where: { id: 1 },
      create: { name: "NewUser" },
      update: { name: "UpdatedUser" },
    },
  });

  await expect(page.locator("pre").first()).toContainText(`{ "keyPath": [ 1 ], "oldKeyPath": [ 1 ] }`);
});

test("updateEvent_UpdateUserId_EmitsUpdateEventWithNewId", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "NewUser" } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { id: 2, name: "UpdatedUser" } },
  });

  await expect(page.locator("pre").first()).toContainText(`{ "keyPath": [ 2 ], "oldKeyPath": [ 1 ] }`);
});
