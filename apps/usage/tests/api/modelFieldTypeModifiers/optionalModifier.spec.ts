import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("optionalModifier_CreateWithNullableField_AssignsNullAsDefault", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "create",
    query: { data: { user: { create: { name: "John" } } } },
  });
});
