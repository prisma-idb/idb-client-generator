import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("updateMany_NestedUpdateManyQuery_OnlyUpdatesRecordsBelongingToTargetParent", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "createMany",
    query: { data: [{ name: "Alice" }, { name: "Bob" }] },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "post",
    operation: "createMany",
    query: {
      data: [
        { title: "Alice Post", authorId: 1 },
        { title: "Bob Post", authorId: 2 },
      ],
    },
  });

  // Nested updateMany scoped to Alice — should NOT touch Bob's posts
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "update",
    query: {
      where: { id: 1 },
      data: { posts: { updateMany: { where: {}, data: { title: "Alice Updated" } } } },
      include: { posts: true },
    },
  });

  // Bob's post must be unchanged
  await expectQueryToSucceed({
    page,
    prisma,
    model: "post",
    operation: "findMany",
    query: { where: { title: "Bob Post" } },
  });
});

test("updateMany_NestedUpdateManyQuery_SuccessfullyUpdatesMultipleNestedRelations", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice", posts: { create: [{ title: "Post1" }, { title: "Post2" }] } } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "update",
    query: {
      where: { id: 1 },
      data: { posts: { updateMany: { where: { title: { contains: "Post" } }, data: { title: "Updated Post" } } } },
    },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "post",
    operation: "findMany",
    query: { where: { title: "Updated Post" } },
  });
});

test("updateMany_NestedUpdateManyQueryWithInvalidData_LeavesAsIs", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "Bob", posts: { create: [{ title: "Post1" }] } } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "update",
    query: {
      where: { id: 1 },
      data: { posts: { updateMany: { where: { id: 999 }, data: { title: "Invalid Update" } } } },
    },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findMany",
    query: { include: { posts: true } },
  });
});

test("updateMany_NestedUpdateManyQueryWithEmptyData_SuccessfullyHandlesNoUpdate", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "Charlie", posts: { create: [{ title: "Post1" }, { title: "Post2" }] } } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "update",
    query: {
      where: { id: 1 },
      data: { posts: { updateMany: { where: { title: { contains: "NonExistent" } }, data: { title: "No Update" } } } },
    },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "post",
    operation: "findMany",
    query: { where: { title: "No Update" } },
  });
});
