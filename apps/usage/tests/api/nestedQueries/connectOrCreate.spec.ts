import { test } from "../../fixtures";
import { expectQueryToFail, expectQueryToSucceed } from "../../queryRunnerHelper";

test("connectOrCreate_ConnectOrCreateProfileToUser_AddsOrConnectsProfile", async ({ page }) => {
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
    query: {
      data: {
        bio: "John's bio",
        user: {
          connectOrCreate: {
            where: { id: 1 },
            create: { name: "John" },
          },
        },
      },
    },
  });

  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "findMany",
    query: { include: { user: true } },
  });
});

test("connectOrCreate_ConnectOrCreateProfileToInvalidUser_CreatesUser", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "create",
    query: {
      data: {
        bio: "John's bio",
        user: {
          connectOrCreate: {
            where: { id: 999 },
            create: { name: "John" },
          },
        },
      },
    },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findUnique",
    query: { where: { id: 999 } },
  });
});

test("connectOrCreate_ConnectOrCreatePostsToUser_AddsOrConnectsPosts", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "createMany",
    query: {
      data: [
        { id: 1, title: "post1" },
        { id: 4, title: "post2" },
      ],
    },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: {
      data: {
        name: "John",
        posts: {
          connectOrCreate: {
            where: { id: 1 },
            create: { title: "post1" },
          },
        },
      },
    },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
    query: { include: { author: true }, orderBy: { id: "asc" } },
  });
});

test("connectOrCreate_ConnectOrCreateNonExistentPost_CreatesAndConnectsPost", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: {
      data: {
        name: "John",
        posts: {
          connectOrCreate: {
            where: { id: 999 },
            create: { title: "non-existent post" },
          },
        },
      },
    },
  });
});

test("connectOrCreate_ConnectOrCreateMultipleProfilesToUser_ThrowsErrorOnDuplicate", async ({ page }) => {
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
    query: {
      data: {
        bio: "John's bio 1",
        user: {
          connectOrCreate: {
            where: { id: 1 },
            create: { name: "John" },
          },
        },
      },
    },
  });

  await expectQueryToFail({
    page,
    model: "profile",
    operation: "create",
    query: {
      data: {
        bio: "John's bio 2",
        user: {
          connectOrCreate: {
            where: { id: 1 },
            create: { name: "John" },
          },
        },
      },
    },
    errorMessage:
      "Unable to add key to index 'userIdIndex': at least one key does not satisfy the uniqueness requirements.",
  });

  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "findMany",
  });
});

test("connectOrCreate_UpdateUserWithConnectOrCreateProfile_AddsOrConnectsProfile", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John" } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "update",
    query: {
      where: { id: 1 },
      data: {
        profile: {
          connectOrCreate: {
            where: { id: 1 },
            create: { bio: "John's updated bio" },
          },
        },
      },
    },
  });

  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "findMany",
    query: { include: { user: true } },
  });
});

test("connectOrCreate_UpdateUserWithConnectOrCreateNonExistentProfile_CreatesAndConnectsProfile", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John" } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "update",
    query: {
      where: { id: 1 },
      data: {
        profile: {
          connectOrCreate: {
            where: { id: 999 },
            create: { bio: "non-existent profile" },
          },
        },
      },
    },
  });

  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "findMany",
    query: { include: { user: true } },
  });
});
