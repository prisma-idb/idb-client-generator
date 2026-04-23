import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("is_WithBasicFilters_ReturnsFilteredRecord", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "John", profile: { create: { bio: "John's bio" } } } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice", profile: { create: { bio: "Alice's bio" } } } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findMany",
    query: { where: { profile: { is: { bio: { contains: "Alice" } } } } },
  });
});

test("is_OnNullableField_GetsPostsWithoutAnAuthor", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "John" } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "post",
    operation: "createMany",
    query: { data: [{ title: "John's post", authorId: 1 }, { title: "Author-less" }] },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "post",
    operation: "findMany",
    query: { where: { author: { is: null } } },
  });
});

test("is_OnNullableFieldMetaOnOther_GetsUsersWithoutProfile", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "John", profile: { create: { bio: "John's bio" } } } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice" } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findMany",
    query: { where: { profile: { is: null } } },
  });
});
