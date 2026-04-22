import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("updateMany_ChangeNames_SuccessfullyUpdatesRecord", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "createMany",
    query: { data: [{ name: "John" }, { name: "Alice" }, { name: "Clark" }] },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "updateMany",
    query: { where: { name: { contains: "c", mode: "insensitive" } }, data: { name: "ALICE" } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findMany",
  });
});

test("updateMany_ChangeForeignKey_SuccessfullyUpdatesFKOnMatchingRecords", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "createMany",
    query: { data: [{ name: "UserA" }, { name: "UserB" }] },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "todo",
    operation: "createMany",
    query: {
      data: [
        { id: "aaaaaaaa-0001-0001-0001-000000000001", title: "Task1", userId: 1 },
        { id: "aaaaaaaa-0001-0001-0001-000000000002", title: "Task2", userId: 1 },
      ],
    },
  });

  // Move all of UserA's todos to UserB — requires User store to be open for FK validation
  await expectQueryToSucceed({
    page,
    prisma,
    model: "todo",
    operation: "updateMany",
    query: { where: { userId: 1 }, data: { userId: 2 } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "todo",
    operation: "findMany",
    query: { where: { userId: 2 } },
  });
});
