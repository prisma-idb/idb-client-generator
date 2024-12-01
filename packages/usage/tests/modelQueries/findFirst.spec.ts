import { test } from "../fixtures";
import { expectQueryToSucceed } from "../queryRunnerHelper";

test("findFirst_NoMatchingRecords_ReturnsEmptyArray", async ({ page }) => {
  await expectQueryToSucceed({ page, model: "user", operation: "findFirst" });
});

test("findFirst_ValidQuery_ReturnsFirstRecord", async ({ page }) => {
  await expectQueryToSucceed({ page, model: "user", operation: "create", query: { data: { name: "John" } } });
  await expectQueryToSucceed({ page, model: "user", operation: "findFirst" });
});
