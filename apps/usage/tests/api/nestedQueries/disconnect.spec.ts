import { test } from "../../fixtures";
import { expectQueryToFail, expectQueryToSucceed } from "../../queryRunnerHelper";

test("disconnect_DisconnectExistingRelations_SuccessfullyDisconnects", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "John", posts: { create: [{ title: "Post1" }, { title: "Post2" }] } } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { posts: { disconnect: [{ id: 1 }] } } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findMany",
    query: { include: { posts: true } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "post",
    operation: "findMany",
    query: { include: { author: true }, orderBy: { id: "asc" } },
  });
});

test("disconnect_DisconnectNonExistentRelation_ThrowsError", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "John" } },
  });

  // IDB client intentionally throws here; Prisma silently no-ops
  await expectQueryToFail({
    page,
    prisma,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { posts: { disconnect: [{ id: 999 }] } } },
    errorMessage: "Record not found",
    expectPrismaToAlsoFail: false,
  });
});

test("disconnect_DisconnectRequiredRelation_ThrowsError", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "John", profile: { create: { bio: "John's bio" } } } },
  });

  await expectQueryToFail({
    page,
    prisma,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { profile: { disconnect: true } } },
    errorMessage: "Cannot disconnect required relation",
  });
});

test("disconnect_DisconnectRequiredOneToManyRelation_ThrowsAndLeavesStateUnchanged", async ({ page, prisma }) => {
  // Todo.userId is required, so disconnecting a todo from its user is forbidden.
  // The tx should be aborted so no partial mutations survive.
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
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { todos: { disconnect: [{ id: "aaaaaaaa-0000-0000-0000-000000000001" }] } } },
    errorMessage: "Cannot disconnect required relation",
  });

  // Transaction should have been aborted — todo still belongs to user
  await expectQueryToSucceed({
    page,
    prisma,
    model: "todo",
    operation: "findMany",
    query: { where: { userId: 1 } },
  });
});
