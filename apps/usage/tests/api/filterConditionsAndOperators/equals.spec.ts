import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("equals_NullableStringField_ReturnsFilteredRecords", async ({ page }) => {
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
    query: { data: { name: "John", profile: { create: { bio: "John's bio" } } } },
  });
  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "findMany",
    query: { where: { bio: { equals: null } } },
  });
  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "findMany",
    query: { where: { bio: { equals: "John's bio" } } },
  });
});

test("equals_IntField_ReturnsFilteredRecords", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice", id: 3 } },
  });
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John", id: 5 } },
  });
  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "findMany",
    query: { where: { id: { equals: 3 } } },
  });
  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "findMany",
    query: { where: { id: { equals: 1 } } },
  });
});
