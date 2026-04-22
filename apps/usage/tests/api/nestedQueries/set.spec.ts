import { test } from "../../fixtures";
import { expectQueryToSucceed, expectQueryToFail } from "../../queryRunnerHelper";

test("set_DisconnectExistingRelations_SuccessfullyDisconnects", async ({ page, prisma }) => {
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
    query: { where: { id: 1 }, data: { posts: { set: [] } } },
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
    query: { include: { author: true } },
  });
});

test("set_NestedSetQuery_SuccessfullySetsNestedRelations", async ({ page, prisma }) => {
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
    model: "post",
    operation: "create",
    query: { data: { title: "Post1" } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { posts: { set: [{ id: 1 }] } } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findMany",
    query: { include: { posts: true } },
  });
});

test("set_InvalidSetQuery_ThrowsError", async ({ page, prisma }) => {
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
    query: { where: { id: 1 }, data: { posts: { set: [{ id: 999 }] } } },
    errorMessage: "Record not found",
    expectPrismaToAlsoFail: false,
  });
});
