import { test } from "../../fixtures";
import { expectQueryToFail, expectQueryToSucceed } from "../../queryRunnerHelper";

test("restrict_DeleteUserWithGroups_ThrowsError", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "group",
    operation: "create",
    query: { data: { name: "Admins" } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "John Doe" } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "userGroup",
    operation: "create",
    query: { data: { userId: 1, groupId: 1, joinedOn: new Date() } },
  });

  await expectQueryToFail({
    page,
    prisma,
    model: "user",
    operation: "delete",
    query: { where: { id: 1 } },
    errorMessage: "Cannot delete record, other records depend on it",
  });
});

test("restrict_DeleteUserWithoutComments_SuccessfullyDeletesUser", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice Smith" } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "delete",
    query: { where: { id: 1 } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findMany",
  });
});
