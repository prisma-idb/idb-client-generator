import { test } from "../fixtures";
import { expectQueryToSucceed } from "../queryRunnerHelper";

test("isNot_WithBasicFilters_ReturnsRecordsNotMatchingFilters", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John", profile: { create: { bio: "John's bio" } } } },
  });
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice", profile: { create: { bio: "Alice's bio" } } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { where: { profile: { isNot: { bio: { contains: "Alice" } } } } },
  });
});

test("isNot_OnNullableField_GetsPostsWithAnAuthor", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John" } },
  });
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "createMany",
    query: { data: [{ title: "John's post", authorId: 1 }, { title: "Author-less" }] },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
    query: { where: { author: { isNot: null } } },
  });
});

test("isNot_OnNullableFieldMetaOnOther_GetsUsersWithProfile", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John", profile: { create: { bio: "John's bio" } } } },
  });
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice" } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { where: { profile: { isNot: null } } },
  });
});
