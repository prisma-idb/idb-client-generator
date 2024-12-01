import { test } from "../fixtures";
import { expectQueryToFail, expectQueryToSucceed } from "../queryRunnerHelper";

test("findFirstOrThrow_NoMatchingRecords_ThrowsError", async ({ page }) => {
  await expectQueryToFail({ page, model: "user", operation: "findFirstOrThrow", errorMessage: "Record not found" });
});

test("findFirstOrThrow_ValidQuery_ReturnsFirstRecord", async ({ page }) => {
  await expectQueryToSucceed({ page, model: "user", operation: "create", query: { data: { name: "John" } } });
  await expectQueryToSucceed({ page, model: "user", operation: "findFirstOrThrow" });
});
