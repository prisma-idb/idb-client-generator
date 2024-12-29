import { createId } from "@paralleldrive/cuid2";
import { test } from "../../fixtures";
import { expectQueryToSucceed, expectQueryToFail } from "../../queryRunnerHelper";

test("update_NestedUpdateQuery_SuccessfullyUpdatesNestedRelations", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John" } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "create",
    query: { data: { title: "Post1", author: { connect: { id: 1 } } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { posts: { update: { where: { id: 1 }, data: { title: "Updated Post1" } } } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { include: { posts: true } },
  });
});

test("update_NestedUpdateQueryWithCreate_SuccessfullyCreatesAndUpdatesNestedRelations", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice" } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "update",
    query: {
      where: { id: 1 },
      data: {
        posts: {
          create: { title: "New Post" },
          update: { where: { id: 1 }, data: { title: "Updated Post" } },
        },
      },
    },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { include: { posts: true } },
  });
});

test("update_NestedUpdateQueryWithDisconnect_SuccessfullyDisconnectsNestedRelations", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Bob" } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "create",
    query: { data: { title: "Post2", author: { connect: { id: 1 } } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { posts: { disconnect: { id: 1 } } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { include: { posts: true } },
  });
});

test("update_NestedUpdateQueryWithDelete_SuccessfullyDeletesNestedRelations", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Charlie" } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "create",
    query: { data: { title: "Post3", author: { connect: { id: 1 } } } },
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
});

test("update_InvalidNestedUpdateQuery_ThrowsError", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "David" } },
  });

  await expectQueryToFail({
    page,
    model: "user",
    operation: "update",
    query: { where: { id: 999 }, data: { posts: { update: { where: { id: 1 }, data: { title: "Invalid Update" } } } } },
    errorMessage: "Record not found",
  });
});
test("update_NestedUpdateQueryWithTwoLevels_SuccessfullyUpdatesNestedRelations", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Eve" } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "create",
    query: { data: { title: "Post4", author: { connect: { id: 1 } } } },
  });

  const cuid = createId();
  await expectQueryToSucceed({
    page,
    model: "comment",
    operation: "create",
    query: { data: { id: cuid, text: "Comment1", post: { connect: { id: 1 } }, user: { connect: { id: 1 } } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "update",
    query: {
      where: { id: 1 },
      data: {
        posts: {
          update: {
            where: { id: 1 },
            data: {
              title: "Updated Post4",
              comments: {
                update: {
                  where: { id: cuid },
                  data: { text: "Updated Comment1" },
                },
              },
            },
          },
        },
      },
    },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { include: { posts: { include: { comments: true } } } },
  });
});

