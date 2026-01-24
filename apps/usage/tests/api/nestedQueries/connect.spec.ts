import { test } from "../../fixtures";
import { expectQueryToFail, expectQueryToSucceed } from "../../queryRunnerHelper";

test("connect_ConnectProfileToUser_AddsForeignKeyToProfile", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John" } },
  });

  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "create",
    query: { data: { bio: "John's bio", user: { connect: { id: 1 } } } },
  });
});

test("connect_ConnectProfileToInvalidUser_ThrowsError", async ({ page }) => {
  await expectQueryToFail({
    page,
    model: "profile",
    operation: "create",
    query: { data: { bio: "John's bio", user: { connect: { id: 1 } } } },
    errorMessage: "Record not found",
  });
  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "findMany",
  });
});

test("connect_ConnectProfileToUserDirectly_AddsForeignKeyToProfile", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John" } },
  });

  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "create",
    query: { data: { bio: "John's bio", userId: 1 } },
  });
});

test("connect_ConnectProfileToInvalidUserDirectly_ThrowsError", async ({ page }) => {
  await expectQueryToFail({
    page,
    model: "profile",
    operation: "create",
    query: { data: { bio: "John's bio", userId: 1 } },
    errorMessage: "Record not found",
  });
  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "findMany",
  });
});

test("connect_ConnectTwoProfilesToUser_ThrowsError", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John" } },
  });

  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "create",
    query: { data: { bio: "John's bio 1", user: { connect: { id: 1 } } } },
  });

  await expectQueryToFail({
    page,
    model: "profile",
    operation: "create",
    query: { data: { bio: "John's bio 2", user: { connect: { id: 1 } } } },
    errorMessage:
      "Unable to add key to index 'userIdIndex': at least one key does not satisfy the uniqueness requirements.",
  });

  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "findMany",
    query: { include: { user: true } },
  });
});

test("connect_ConnectValidPostsToUser_AddsForeignKeysToPosts", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "createMany",
    query: {
      data: [
        { id: 1, title: "post1" },
        { id: 2, title: "post2" },
      ],
    },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John", posts: { connect: [{ id: 1 }, { id: 2 /* conditions in connect */ }] } } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
    query: { include: { author: true } },
  });
});

test("connect_ConnectNonExistentProfile_ThrowsError", async ({ page }) => {
  await expectQueryToFail({
    page,
    model: "user",
    operation: "create",
    query: {
      data: { name: "John", profile: { connect: { id: 1 } } },
    },
    errorMessage: "Record not found",
  });
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
  });
});

test("connect_ConnectProfileToUserWithNameCondition_SuccessfullyConnects", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Jane" } },
  });
  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "create",
    query: { data: { bio: "Jane's bio", user: { connect: { id: 1, name: "Jane" } } } },
  });
  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "findMany",
    query: { include: { user: true } },
  });
});

test("connect_ConnectProfileToInvalidNameCondition_ThrowsError", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Bob" } },
  });
  await expectQueryToFail({
    page,
    model: "profile",
    operation: "create",
    query: { data: { bio: "Failing bio", user: { connect: { id: 1, name: "Alice" } } } },
    errorMessage: "Record not found",
  });
  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "findMany",
  });
});

// Connect multiple posts to the same user if posts meet certain conditions
test("connect_ConnectMultiplePostsToUserWithTitleCondition_SuccessfullyConnects", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "createMany",
    query: {
      data: [
        { id: 10, title: "Title A" },
        { id: 11, title: "Title B" },
      ],
    },
  });
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Charlie" } },
  });
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "update",
    query: {
      where: { id: 1 },
      data: {
        posts: {
          connect: [
            { title: "Title A", id: 10 },
            { title: "Title B", id: 11 },
          ],
        },
      },
    },
  });
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
    query: { include: { author: true } },
  });
});

// Attempt to connect two profiles to a user with name condition, expecting an error
test("connect_ConnectTwoProfilesToUserWithNameCondition_ThrowsError", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Dave" } },
  });
  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "create",
    query: { data: { bio: "First bio", user: { connect: { id: 1 } } } },
  });
  await expectQueryToFail({
    page,
    model: "profile",
    operation: "create",
    query: { data: { bio: "Second bio", user: { connect: { id: 1 } } } },
    errorMessage:
      "Unable to add key to index 'userIdIndex': at least one key does not satisfy the uniqueness requirements.",
  });
  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "findMany",
    query: { include: { user: true } },
  });
});
