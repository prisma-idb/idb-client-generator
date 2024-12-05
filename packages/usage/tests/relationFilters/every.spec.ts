import { test } from "../fixtures";
import { expectQueryToSucceed } from "../queryRunnerHelper";

test("every_WithBasicFilters_ReturnsFilteredRecord", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John", posts: { createMany: { data: [{ title: "Post 3" }, { title: "Post 2" }] } } } },
  });
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice", posts: { createMany: { data: [{ title: "Post 3" }, { title: "Post 33" }] } } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { where: { posts: { every: { title: { contains: "3" } } } } },
  });
});
