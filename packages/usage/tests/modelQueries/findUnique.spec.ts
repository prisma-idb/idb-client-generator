import { test } from "../fixtures";
import { expectQueryToSucceed } from "../queryRunnerHelper";

test("findUnique_NoMatchingRecords_ReturnsEmptyArray", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findUnique",
    query: { where: { id: 1 } },
  });
});

test("findUnique_ValidQuery_ReturnsFirstRecord", async ({ page }) => {
  await expectQueryToSucceed({ page, model: "user", operation: "create", query: { data: { name: "John" } } });
  await expectQueryToSucceed({ page, model: "user", operation: "findUnique", query: { where: { id: 1 } } });
});
