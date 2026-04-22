import { test } from "../../fixtures";
import { expectQueryToFail, expectQueryToSucceed } from "../../queryRunnerHelper";

test("delete_NoMatchingRecord_ThrowsError", async ({ page, prisma }) => {
  await expectQueryToFail({
    page,
    prisma,
    model: "user",
    operation: "delete",
    query: { where: { id: 1 } },
    errorMessage: "Record not found",
  });
});

test("delete_ExistingRecord_DeletesAndReturnsFirstRecord", async ({ page, prisma }) => {
  await expectQueryToSucceed({ page, prisma, model: "user", operation: "create", query: { data: { name: "John" } } });
  await expectQueryToSucceed({ page, prisma, model: "user", operation: "delete", query: { where: { id: 1 } } });
  await expectQueryToSucceed({ page, prisma, model: "user", operation: "findMany" });
});

test("delete_ExistingRecordWithCascade_DeletesAndReturnsFirstRecordWithRelation", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "John", profile: { create: { bio: "John's bio" } } } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "delete",
    query: { where: { id: 1 }, include: { profile: true } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "profile",
    operation: "findMany",
    query: { include: { user: true } },
  });
});

test("delete_WithSelectWithoutPrimaryKey_ReturnsSelectedShapeAndStillCascades", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "John", todos: { create: [{ title: "Todo 1" }, { title: "Todo 2" }] } } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "delete",
    query: { where: { id: 1 }, select: { name: true } },
  });

  await expectQueryToSucceed({ page, prisma, model: "todo", operation: "findMany" });
});
