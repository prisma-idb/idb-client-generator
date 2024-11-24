import { test } from "../fixtures";
import { expectQueryToFail, expectQueryToSucceed } from "../queryRunnerHelper";

test("findUniqueOrThrow_NoMatchingRecords_ThrowsError", async ({ page }) => {
  await expectQueryToFail({
    page,
    model: "user",
    operation: "findUniqueOrThrow",
    errorMessage: "Record not found",
    query: { where: { id: 1 } },
  });
});

test("findUniqueOrThrow_ValidQuery_ReturnsFirstRecord", async ({ page }) => {
  await expectQueryToSucceed({ page, model: "user", operation: "create", query: { data: { name: "John" } } });
  await expectQueryToSucceed({ page, model: "user", operation: "findUniqueOrThrow", query: { where: { id: 1 } } });
});
