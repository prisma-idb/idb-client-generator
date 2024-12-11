import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("orderBy_StringField_ReturnsSortedData", async ({ page }) => {
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
    query: { orderBy: { name: "asc" } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { orderBy: { name: "desc" } },
  });
});

test("orderBy_NestedRelationStringField_ReturnsSortedData", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John", profile: { create: { bio: "A" } } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice", profile: { create: { bio: "B" } } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { orderBy: { profile: { bio: "asc" } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { orderBy: { profile: { bio: "desc" } } },
  });
});

test("orderBy_MultipleFields_ReturnsSortedData", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John" } },
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
    operation: "create",
    query: { data: { name: "Alice" } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { orderBy: [{ name: "asc" }, { id: "desc" }] },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { orderBy: [{ name: "desc" }, { id: "desc" }] },
  });
});

test("orderBy_MultipleFieldsWithNestedFields_ReturnsSortedData", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John", profile: { create: { bio: "B" } } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice", profile: { create: { bio: "C" } } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice", profile: { create: { bio: "A" } } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { orderBy: [{ name: "asc" }, { profile: { bio: "asc" } }] },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { orderBy: [{ profile: { bio: "desc" } }, { name: "asc" }] },
  });
});

test("orderBy_CountOfOneToMany_ReturnsSortedData", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John", posts: { createMany: { data: { title: "Post1" } } } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice", posts: { createMany: { data: [{ title: "Post2" }, { title: "Post3" }] } } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { orderBy: { posts: { _count: "asc" } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { orderBy: { posts: { _count: "desc" } } },
  });
});

test("orderBy_WithNullableField_ReturnsSortedData", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John", profile: { create: { bio: "B" } } } },
  });
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Robert", profile: { create: { bio: "A" } } } },
  });
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice", profile: { create: { bio: null } } } },
  });

  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "findMany",
    query: { orderBy: { bio: { nulls: "first", sort: "asc" } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: {
      orderBy: [
        { name: "asc" },
        { profile: { bio: { nulls: "first", sort: "asc" } } },
        { comments: { _count: "asc" } },
      ],
    },
  });
});
