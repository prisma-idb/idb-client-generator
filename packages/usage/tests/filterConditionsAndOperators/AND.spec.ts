import { test } from "../fixtures";
import { expectQueryToSucceed } from "../queryRunnerHelper";

test("AND_MultipleConditions_ReturnsFilteredRecords", async ({ page }) => {
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
    query: { where: { AND: [{ name: { contains: "J" } }, { name: { contains: "y" } }] } },
  });
});

test("AND_NestedRelationCondition_ReturnsFilteredRecords", async ({ page }) => {
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
    query: { where: { AND: [{ profile: { bio: { contains: "er" } } }, { name: { contains: "J" } }] } },
  });
});
