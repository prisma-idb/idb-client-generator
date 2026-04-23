import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("deleteMany_NestedDeleteManyQuery_SuccessfullyDeletesMultipleNestedRelations", async ({ page, prisma }) => {
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
    query: { where: { id: 1 }, data: { posts: { deleteMany: { title: { contains: "Post" } } } } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findMany",
    query: { include: { posts: true } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "post",
    operation: "findMany",
  });
});

test("deleteMany_NestedDeleteManyQueryWithInvalidData_LeavesAsIs", async ({ page, prisma }) => {
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
    query: { where: { id: 1 }, data: { posts: { deleteMany: { id: 999 } } } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findMany",
    query: { include: { posts: true } },
  });
});

test("deleteMany_NestedDeleteManyQueryWithCascade_SuccessfullyDeletesCascadingRelations", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
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
    prisma,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { posts: { deleteMany: { title: { contains: "Post" } } } } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "post",
    operation: "findMany",
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "comment",
    operation: "findMany",
  });
});

test("deleteMany_NestedDeleteManyQueryWithEmptyData_SuccessfullyHandlesNoDeletion", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "Eve", posts: { create: [{ title: "Post1" }, { title: "Post2" }] } } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { posts: { deleteMany: { title: { contains: "NonExistent" } } } } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findMany",
    query: { include: { posts: true } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "post",
    operation: "findMany",
  });
});
