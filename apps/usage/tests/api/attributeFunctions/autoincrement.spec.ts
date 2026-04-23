import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("AutoincrementAttributeFunction_WithNoId_AssignsDefaultId", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "John Doe" } },
  });
});
