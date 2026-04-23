import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("optionalModifier_CreateWithNullableField_AssignsNullAsDefault", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "profile",
    operation: "create",
    query: { data: { user: { create: { name: "John" } } } },
  });
});
