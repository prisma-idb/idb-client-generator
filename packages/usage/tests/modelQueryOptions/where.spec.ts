import { test } from "../fixtures";
import { expectQueryToSucceed } from "../queryRunnerHelper";

test("where_BasicFilter_ReturnsFilteredRecord", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "createMany",
    query: { data: [{ name: "John" }, { name: "Alice" }] },
  });
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { where: { name: "Alice" } },
  });
});

test("where_OneToOneRelationFilter_ReturnsFilteredRecord", async ({ page }) => {
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
    query: { where: { profile: { bio: { contains: "Alice" } } } },
  });
});

test("where_ManyToOneRelationFilter_GetsPostsWithoutAnAuthor", async ({ page }) => {
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
    query: { where: { author: null } },
  });
});
