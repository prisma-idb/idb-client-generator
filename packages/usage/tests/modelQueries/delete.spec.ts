import { test } from "../fixtures";
import { expectQueryToFail, expectQueryToSucceed } from "../queryRunnerHelper";

test("delete_NoMatchingRecord_ThrowsError", async ({ page }) => {
  await expectQueryToFail({
    page,
    model: "user",
    operation: "delete",
    query: { where: { id: 1 } },
    errorMessage: "Record not found",
  });
});

test("delete_ExistingRecord_DeletesAndReturnsFirstRecord", async ({ page }) => {
  await expectQueryToSucceed({ page, model: "user", operation: "create", query: { data: { name: "John" } } });
  await expectQueryToSucceed({ page, model: "user", operation: "delete", query: { where: { id: 1 } } });
  await expectQueryToSucceed({ page, model: "user", operation: "findMany" });
});

test("delete_ExistingRecordWithCascade_DeletesAndReturnsFirstRecordWithRelation", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John", profile: { create: { bio: "John's bio" } } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "delete",
    query: { where: { id: 1 }, include: { profile: true } },
  });
  await expectQueryToSucceed({ page, model: "profile", operation: "findMany", query: { include: { user: true } } });
});
