import { test } from "../../fixtures";
import { expectQueryToFail, expectQueryToSucceed } from "../../queryRunnerHelper";

test("update_ChangeId_SuccessfullyUpdatesRecord", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { id: 1, name: "John Doe" } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { name: "Alice" } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
  });
});

test("update_CascadeUpdateToFkFields_SuccessfullyUpdatesDependentRecords", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { id: 1, name: "John Doe" } },
  });

  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "create",
    query: { data: { id: 1, userId: 1, bio: "Hello World" } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { id: 2 } },
  });

  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "findMany",
    query: { where: { userId: 2 } },
  });
});

test("update_ChangeIdToExistingId_ThrowsError", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { id: 1, name: "John Doe" } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { id: 2, name: "Jane Doe" } },
  });

  await expectQueryToFail({
    page,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { id: 2 } },
    errorMessage: "Record with the same keyPath already exists",
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
  });
});
