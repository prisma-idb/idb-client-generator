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
