import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("distinct_SingleField_ReturnsDistinctRows", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "createMany",
    query: {
      data: [{ name: "Alice" }, { name: "Alice" }, { name: "Bob" }, { name: "Bob" }],
    },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: {
      distinct: "name",
      orderBy: { name: "asc" },
    },
  });
});

test("distinct_MultipleFields_ReturnsDistinctRows", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "createMany",
    query: {
      data: [{ name: "Charlie" }, { name: "Charlie" }, { name: "Charlie" }],
    },
  });
  // Re-create with same name but also a different field to test multiple distinct fields
  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "createMany",
    query: {
      data: [
        { bio: "Charlie Bio", userId: 1 },
        { bio: "Charlie Bio", userId: 2 },
        { bio: "Charlie Bio2", userId: 3 },
      ],
    },
  });

  // Distinct on multiple fields doesn't do much if there's only one user, but we include it for coverage
  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "findMany",
    query: {
      distinct: ["bio", "userId"],
      orderBy: [{ bio: "asc" }, { userId: "asc" }],
    },
  });
});

test("distinct_WithWhereClause_AppliesFiltersAndDistinct", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "createMany",
    query: {
      data: [{ name: "John" }, { name: "John" }, { name: "Alice" }],
    },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: {
      where: { name: { contains: "Jo" } },
      distinct: "name",
    },
  });
});

test("distinct_WithOrderByAndMultipleUsers_ReturnsOrderedDistinctData", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "createMany",
    query: {
      data: [{ name: "John" }, { name: "John" }, { name: "Bob" }, { name: "Bob" }, { name: "Charlie" }],
    },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: {
      distinct: "name",
      orderBy: [{ name: "desc" }],
    },
  });
});
