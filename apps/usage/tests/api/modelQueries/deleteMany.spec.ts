import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("deleteMany_NoMatchingRecord_ReturnsCount0", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "deleteMany",
    query: { where: { id: 1 } },
  });
});

test("deleteMany_AllRecords_DeletesAndReturnsCount", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "createMany",
    query: { data: [{ name: "John" }, { name: "Alice" }] },
  });
  await expectQueryToSucceed({ page, prisma, model: "user", operation: "deleteMany" });
  await expectQueryToSucceed({ page, prisma, model: "user", operation: "findMany" });
});

test("delete_AllRecordsWithRelations_CascadeDeletesProfile", async ({ page, prisma }) => {
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
    operation: "create",
    query: { data: { name: "Alice", profile: { create: { bio: "Alice's bio" } } } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "deleteMany",
  });
  await expectQueryToSucceed({ page, prisma, model: "profile", operation: "findMany" });
  await expectQueryToSucceed({ page, prisma, model: "user", operation: "findMany" });
});
