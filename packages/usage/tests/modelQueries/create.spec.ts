import { test } from "../fixtures";
import { expectQueryToSucceed } from "../queryRunnerHelper";

test("create_ValidData_SuccessfullyCreatesRecord", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { id: 1, name: "John Doe" } },
  });
});

test("create_WithGeneratedId_AssignsDefaultId", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John Doe" } },
  });
});

test("create_WithNullableField_AssignsNullAsDefault", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "create",
    query: { data: { user: { create: { name: "John" } } } },
  });
});

// TODO: all possible default functions
