import { test } from "../fixtures";
import { expectQueryToFail, expectQueryToSucceed } from "../queryRunnerHelper";

test("create_NestedCreateTransactionFailsOnError_RollsBackChanges", async ({ page }) => {
  // Create test user with profile
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { id: 1, name: "Alice with bio", profile: { create: { bio: "generic bio" } } } },
  });

  // Repeat with same IDs (should fail)
  await expectQueryToFail({
    page,
    model: "user",
    operation: "create",
    query: { data: { id: 1, name: "Alice with bio", profile: { create: { bio: "generic bio" } } } },
    errorMessage:
      "Unable to add key to index 'userIdIndex': at least one key does not satisfy the uniqueness requirements.",
  });

  await expectQueryToSucceed({ page, model: "user", operation: "count" });
  await expectQueryToSucceed({ page, model: "profile", operation: "count" });
});

test("create_WithOneToOneRelationMetaOnNested_SuccessfullyCreatesBothEntities", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice with bio", profile: { create: { bio: "generic bio" } } } },
  });
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findUnique",
    query: { where: { id: 1 } },
  });
  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "findUnique",
    query: { where: { userId: 1 } },
  });
});

test("create_WithOneToOneRelationMetaOnParent_SuccessfullyCreatesBothEntities", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "create",
    query: { data: { bio: "Alice's bio", user: { create: { name: "Alice" } } } },
  });
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findUnique",
    query: { where: { id: 1 } },
  });
});

test("create_WithOneToManyRelation_CreatesParentAndOneChildRecord", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice", posts: { create: { title: "Post1" } } } },
  });
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
    query: { where: { id: 1 } },
  });
});

test("create_WithOneToManyRelation_CreatesParentAndManyChildRecords", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice", posts: { create: [{ title: "Post1" }, { title: "Post2" }] } } },
  });
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
    query: { where: { id: 1 } },
  });
});

test("create_WithManyToManyRelation_CreatesJoinRecords", async () => {
  // TODO
});

test("create_WithDeeplyNestedRelations_PersistsAllEntities", async () => {
  // TODO
});
