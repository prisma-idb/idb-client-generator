import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("updateMany_NestedUpdateManyQuery_SuccessfullyUpdatesMultipleNestedRelations", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice", posts: { create: [{ title: "Post1" }, { title: "Post2" }] } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "update",
    query: {
      where: { id: 1 },
      data: { posts: { updateMany: { where: { title: { contains: "Post" } }, data: { title: "Updated Post" } } } },
    },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
    query: { where: { title: "Updated Post" } },
  });
});

test("updateMany_NestedUpdateManyQueryWithInvalidData_LeavesAsIs", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Bob", posts: { create: [{ title: "Post1" }] } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "update",
    query: {
      where: { id: 1 },
      data: { posts: { updateMany: { where: { id: 999 }, data: { title: "Invalid Update" } } } },
    },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { include: { posts: true } },
  });
});

test("updateMany_NestedUpdateManyQueryWithEmptyData_SuccessfullyHandlesNoUpdate", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Charlie", posts: { create: [{ title: "Post1" }, { title: "Post2" }] } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "update",
    query: {
      where: { id: 1 },
      data: { posts: { updateMany: { where: { title: { contains: "NonExistent" } }, data: { title: "No Update" } } } },
    },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
    query: { where: { title: "No Update" } },
  });
});
