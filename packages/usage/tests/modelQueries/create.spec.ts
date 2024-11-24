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

test("create_WithGeneratedId_AssignsDefaultId", async () => {
  // TODO, also test out other fillDefaults
});
