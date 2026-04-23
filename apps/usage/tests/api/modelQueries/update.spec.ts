import { test } from "../../fixtures";
import { expectQueryToFail, expectQueryToSucceed } from "../../queryRunnerHelper";

test("update_ChangeId_SuccessfullyUpdatesRecord", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { id: 1, name: "John Doe" } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { name: "Alice" } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findMany",
  });
});

test("update_CascadeUpdateToFkFields_SuccessfullyUpdatesDependentRecords", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { id: 1, name: "John Doe" } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "profile",
    operation: "create",
    query: { data: { id: 1, userId: 1, bio: "Hello World" } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { id: 2 } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "profile",
    operation: "findMany",
    query: { where: { userId: 2 } },
  });
});

test("update_ChangeIdToExistingId_ThrowsError", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { id: 1, name: "John Doe" } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { id: 2, name: "Jane Doe" } },
  });

  await expectQueryToFail({
    page,
    prisma,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { id: 2 } },
    errorMessage: "Record with the same keyPath already exists",
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findMany",
  });
});

test("update_ChangeEnumField_SuccessfullyUpdatesRecord", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "modelWithEnum",
    operation: "create",
    query: { data: { id: 1, enum: "A" } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "modelWithEnum",
    operation: "update",
    query: { where: { id: 1 }, data: { enum: "B" } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "modelWithEnum",
    operation: "findMany",
  });
});

test("update_WithSelect_PreservesSelectedFields", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "John Doe", profile: { create: { bio: "John's Bio" } } } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "update",
    query: {
      where: { id: 1 },
      data: { name: "Alice" },
      select: { name: true, profile: { select: { bio: true } } },
    },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findMany",
    query: { select: { name: true, profile: { select: { bio: true } } } },
  });
});

test("update_WithInclude_PreservesIncludedRelations", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "Jane Doe", profile: { create: { bio: "Jane's Bio" } } } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "update",
    query: {
      where: { id: 1 },
      data: { name: "Janet" },
      include: { profile: true },
    },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findMany",
    query: { include: { profile: true } },
  });
});

test("update_NestedUpdateWithWhere_UpdatesCorrectRelatedRecord", async ({ page, prisma }) => {
  // Regression test: nested relation update with a `where` clause must preserve
  // update.where when normalizing for _getNeededStoresForUpdate, otherwise the
  // wrong (or no) related record is targeted.
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: {
      data: {
        name: "Alice",
        posts: { create: [{ title: "First Post" }, { title: "Second Post" }] },
      },
    },
  });

  // Update only the post titled "First Post" via nested update with where
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "update",
    query: {
      where: { id: 1 },
      data: {
        posts: {
          update: {
            where: { id: 1 },
            data: { title: "Updated First Post" },
          },
        },
      },
    },
  });

  // Verify that only the targeted post was changed
  await expectQueryToSucceed({
    page,
    prisma,
    model: "post",
    operation: "findMany",
    query: { orderBy: { id: "asc" } },
  });
});

test("update_SetFkToNonExistentRecord_ThrowsAndStateUnchanged", async ({ page, prisma }) => {
  // Updating a FK field to an ID that doesn't exist should throw "Related record not found".
  // The tx should be aborted so the todo's FK is not left pointing at a ghost record.
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "John" } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "todo",
    operation: "create",
    query: { data: { id: "aaaaaaaa-0000-0000-0000-000000000001", title: "My Todo", userId: 1 } },
  });

  await expectQueryToFail({
    page,
    prisma,
    model: "todo",
    operation: "update",
    query: { where: { id: "aaaaaaaa-0000-0000-0000-000000000001" }, data: { userId: 99999 } },
    errorMessage: "Related record not found",
  });

  // Transaction should have been aborted — todo's userId is unchanged
  await expectQueryToSucceed({
    page,
    prisma,
    model: "todo",
    operation: "findMany",
  });
});

test("update_DuplicateKeyWithNestedCreate_RollsBackNestedCreate", async ({ page, prisma }) => {
  // When the updated PK collides with an existing record, the tx must abort so that
  // any nested writes that ran before the collision check are fully rolled back.
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { id: 1, name: "User One" } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { id: 2, name: "User Two" } },
  });

  // The nested todo.create runs first (IDB write), then the keyPath collision is
  // detected. The tx.abort() should roll back the todo that was already created.
  await expectQueryToFail({
    page,
    prisma,
    model: "user",
    operation: "update",
    query: {
      where: { id: 1 },
      data: {
        id: 2,
        todos: { create: [{ id: "aaaaaaaa-0000-0000-0000-000000000001", title: "Should be rolled back" }] },
      },
    },
    errorMessage: "Record with the same keyPath already exists",
  });

  // Both users should still exist unchanged
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findMany",
    query: { orderBy: { id: "asc" } },
  });

  // The nested todo create must have been rolled back — no todos should exist
  await expectQueryToSucceed({
    page,
    prisma,
    model: "todo",
    operation: "findMany",
  });
});
