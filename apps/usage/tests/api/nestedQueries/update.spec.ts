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

test("update_ChangingParentKey_UsesOriginalKeyForNestedRelationWrites", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { id: 1, name: "Alice", posts: { create: [{ title: "Post1" }, { title: "Post2" }] } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "update",
    query: {
      where: { id: 1 },
      data: {
        id: 2,
        posts: { deleteMany: { title: { contains: "Post" } } },
      },
      include: { posts: true },
    },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
    query: { where: { authorId: 2 } },
  });
});

test("update_NestedOneToOneUpdateChangesRelatedPK_UpdatesFKOnCurrentRecord", async ({ page }) => {
  // Father holds FKs (motherFirstName, motherLastName) pointing to Mother's composite PK.
  // When we update Father with a nested mother.update that changes Mother's name (PK),
  // the FK fields on Father must be updated too — otherwise Father ends up pointing to a
  // non-existent Mother row.
  await expectQueryToSucceed({
    page,
    model: "mother",
    operation: "create",
    query: { data: { firstName: "Jane", lastName: "Smith" } },
  });

  await expectQueryToSucceed({
    page,
    model: "father",
    operation: "create",
    query: {
      data: {
        firstName: "John",
        lastName: "Smith",
        motherFirstName: "Jane",
        motherLastName: "Smith",
      },
    },
  });

  await expectQueryToSucceed({
    page,
    model: "father",
    operation: "update",
    query: {
      where: { firstName_lastName: { firstName: "John", lastName: "Smith" } },
      data: {
        wife: { update: { firstName: "Janet", lastName: "Smith" } },
      },
      include: { wife: true },
    },
  });

  // Father must now reference the renamed Mother
  await expectQueryToSucceed({
    page,
    model: "father",
    operation: "findMany",
    query: { include: { wife: true } },
  });
});
