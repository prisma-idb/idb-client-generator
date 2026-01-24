import { test } from "../../fixtures";
import { expectQueryToFail, expectQueryToSucceed } from "../../queryRunnerHelper";

test("delete_NestedDeleteQuery_SuccessfullyDeletesNestedRelations", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John", posts: { create: [{ title: "Post1" }, { title: "Post2" }] } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { posts: { delete: { id: 1 } } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { include: { posts: true } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
    query: { where: { id: 1 } },
  });
});

test("delete_NestedDeleteManyQuery_SuccessfullyDeletesMultipleNestedRelations", async ({ page }) => {
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
    query: { where: { id: 1 }, data: { posts: { deleteMany: { title: { contains: "Post" } } } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { include: { posts: true } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
  });
});

test("delete_NestedDeleteQueryWithInvalidData_ThrowsError", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Bob", posts: { create: [{ title: "Post1" }] } } },
  });

  await expectQueryToFail({
    page,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { posts: { delete: { id: 999 } } } },
    errorMessage: "Record not found",
  });
});

test("delete_NestedDeleteQueryWithCascade_SuccessfullyDeletesCascadingRelations", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: {
      data: {
        name: "David",
        posts: { create: [{ title: "Post1", comments: { create: { text: "Comment1", userId: 1 } } }] },
      },
    },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { posts: { delete: { id: 1 } } } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
  });

  await expectQueryToSucceed({
    page,
    model: "comment",
    operation: "findMany",
  });
});
