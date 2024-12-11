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

// TODO: test for other relation types (one-to-many, one-to-oneMetaOnCurrent)
