import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("select_WithRelationAndName_ReturnsSelectedData", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John Doe", profile: { create: { bio: "John's Bio" } } } },
  });
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { select: { profile: true, name: true } },
  });
});

test("select_WithNestedRelationSelect_ReturnsSelectedData", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John Doe", profile: { create: { bio: "John's Bio" } } } },
  });
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { select: { profile: { select: { bio: true } }, name: true } },
  });
});

test("select_WithOneToManyRelation_ReturnsSelectedData", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: {
      data: {
        name: "Jane Doe",
        posts: {
          create: [{ title: "First Post" }, { title: "Second Post" }],
        },
      },
    },
  });
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { select: { posts: true, name: true } },
  });
});

test("select_WithOneToOneRelation_ReturnsSelectedData", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: {
      data: {
        name: "Alice Smith",
        profile: {
          create: { bio: "Sample Meta" },
        },
      },
    },
  });
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { select: { profile: true, name: true } },
  });
});
