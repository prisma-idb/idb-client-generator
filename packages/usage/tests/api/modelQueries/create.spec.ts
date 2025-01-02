import { test } from "../../fixtures";
import { expectQueryToFail, expectQueryToSucceed } from "../../queryRunnerHelper";

test("create_ValidData_SuccessfullyCreatesRecord", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { id: 1, name: "John Doe" } },
  });
});

test("create_NonExistentForeignKey_ShouldFail", async ({ page }) => {
  await expectQueryToFail({
    page,
    model: "profile",
    operation: "create",
    query: { data: { bio: "John's bio", userId: 7 } },
    errorMessage: "Record not found",
  });
});
