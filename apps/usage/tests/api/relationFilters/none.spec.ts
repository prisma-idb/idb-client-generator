import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("none_WithBasicFilters_ReturnsFilteredRecord", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "John", posts: { createMany: { data: [{ title: "Post 1" }, { title: "Post 2" }] } } } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice", posts: { createMany: { data: [{ title: "Post 3" }, { title: "Post 4" }] } } } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findMany",
    query: { where: { posts: { none: { title: { contains: "3" } } } } },
  });
});
