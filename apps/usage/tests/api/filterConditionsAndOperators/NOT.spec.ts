import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("NOT_MultipleConditions_ReturnsFilteredRecords", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Johnny" } },
  });
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John" } },
  });
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { where: { NOT: [{ name: { contains: "y" } }, { name: { endsWith: "y" } }] } },
  });
});

test("NOT_NestedRelationCondition_ReturnsFilteredRecords", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Johnny", profile: { create: { bio: "Cooler bio" } } } },
  });
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John", profile: { create: { bio: "Cool bio" } } } },
  });
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { where: { NOT: [{ profile: { bio: { contains: "er" } } }, { name: { contains: "y" } }] } },
  });
});
