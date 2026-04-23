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

test("restrict_DeleteUserWithCascadedProfileAndGroups_RollsBackCascadedProfileDeletion", async ({ page, prisma }) => {
  // The generated _deleteRecord cascades Profile deletion (Cascade) BEFORE reaching
  // the UserGroup Restrict check. When the Restrict check fires and tx.abort() is
  // called, the cascade-deleted Profile must be restored via the rollback.
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
    model: "profile",
    operation: "create",
    query: { data: { bio: "John's bio", userId: 1 } },
  });

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
    model: "userGroup",
    operation: "create",
    query: { data: { userId: 1, groupId: 1, joinedOn: new Date("2020-01-01T00:00:00.000Z") } },
  });

  await expectQueryToFail({
    page,
    prisma,
    model: "user",
    operation: "delete",
    query: { where: { id: 1 } },
    errorMessage: "Cannot delete record, other records depend on it",
  });

  // Transaction should have been aborted — both user and profile must still exist
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findMany",
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "profile",
    operation: "findMany",
  });
});
