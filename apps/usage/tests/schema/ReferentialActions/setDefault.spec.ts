import { test } from "../../fixtures";
import { expectQueryToFail, expectQueryToSucceed } from "../../queryRunnerHelper";

test("setDefault_DeleteUserWithPosts_ThrowsErrorIfNoDefaultUserIdExists", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: {
      data: {
        name: "John Doe",
        posts: { create: { title: "Post1", comments: { create: { text: "comment1", userId: 1 } } } },
      },
    },
  });

  await expectQueryToFail({
    page,
    prisma,
    model: "user",
    operation: "delete",
    query: { where: { id: 1 } },
    errorMessage: "Related record not found",
  });
});

test("setDefault_DeleteUserWithPosts_SuccessIfDefaultUserIdExists", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { id: 0, name: "Anonymous" } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: {
      data: {
        name: "Alice",
        id: 1,
        posts: { create: { title: "Post1", comments: { create: { text: "comment1", userId: 1 } } } },
      },
    },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "delete",
    query: { where: { id: 1 } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findMany",
    query: { include: { posts: { include: { comments: true } } } },
  });
});
