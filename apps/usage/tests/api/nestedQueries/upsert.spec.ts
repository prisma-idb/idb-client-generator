import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("upsert_NestedUpsertQuery_SuccessfullyUpsertsNestedRelations", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "upsert",
    query: {
      where: { id: 1 },
      create: { id: 1, name: "John", profile: { create: { bio: "John's bio" } } },
      update: {
        name: "John Updated",
        profile: { upsert: { where: { id: 1 }, create: { bio: "Updated bio" }, update: { bio: "Updated bio" } } },
      },
    },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { include: { profile: true } },
  });
});

test("upsert_NestedUpsertQueryWithCreate_SuccessfullyCreatesAndUpsertsNestedRelations", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "upsert",
    query: {
      where: { id: 2 },
      create: { id: 2, name: "Alice", posts: { create: [{ title: "Post1" }, { title: "Post2" }] } },
      update: {
        name: "Alice Updated",
        posts: { upsert: { where: { id: 1 }, create: { title: "New Post" }, update: { title: "Updated Post1" } } },
      },
    },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { include: { posts: true } },
  });
});

test("upsert_NestedUpsertQueryWithDelete_SuccessfullyDeletesNestedRelations", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "upsert",
    query: {
      where: { id: 3 },
      create: { id: 3, name: "Bob", posts: { create: [{ title: "Post3" }] } },
      update: { name: "Bob Updated", posts: { delete: { id: 1 } } },
    },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { include: { posts: true } },
  });
});

test("upsert_NestedUpsertQueryWithInvalidData_CreatesRecords", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "upsert",
    query: {
      where: { id: 999 },
      create: { id: 999, name: "Invalid User", profile: { create: { bio: "Invalid bio" } } },
      update: {
        name: "Invalid User Updated",
        profile: { upsert: { where: { id: 999 }, create: { bio: "Invalid bio" }, update: { bio: "Invalid bio" } } },
      },
    },
  });
});

test("upsert_NestedUpsertQueryWithConnectOrCreate_SuccessfullyConnectsOrCreatesNestedRelations", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "upsert",
    query: {
      where: { id: 4 },
      create: {
        id: 4,
        name: "Charlie",
        profile: { connectOrCreate: { where: { id: 1 }, create: { bio: "Charlie's bio" } } },
      },
      update: {
        name: "Charlie Updated",
        profile: { connectOrCreate: { where: { id: 1 }, create: { bio: "Charlie's updated bio" } } },
      },
    },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { include: { profile: true } },
  });
});
