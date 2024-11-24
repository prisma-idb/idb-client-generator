import { test } from "../fixtures";
import { expectQueryToSucceed } from "../queryRunnerHelper";

test("createMany_ValidData_SuccessfullyCreatesRecords", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "createMany",
    query: { data: [{ name: "John Doe" }, { name: "Alice" }] },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
  });
});
