import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("count_WithoutFilters_ReturnsTotalCount", async ({ page }) => {
  await expectQueryToSucceed({ page, model: "user", operation: "count" });
  await expectQueryToSucceed({ page, model: "user", operation: "create", query: { data: { name: "John Doe" } } });
  await expectQueryToSucceed({ page, model: "user", operation: "count" });
});

test("count_WithSelect_ReturnsSelectedFieldsOnly", async ({ page }) => {
  await expectQueryToSucceed({ page, model: "user", operation: "create", query: { data: { name: "John Doe" } } });
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice", profile: { create: {} } } },
  });
  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "count",
    query: { select: { _all: true, bio: true } },
  });
});
