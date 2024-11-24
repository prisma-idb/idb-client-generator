import { test } from "../fixtures";
import { expectQueryToSucceed } from "../queryRunnerHelper";

test("createManyAndReturn_SelectParticulars_SuccessfullyCreatesAndReturnsRecords", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "createManyAndReturn",
    query: { data: [{ name: "John Doe" }, { name: "Alice" }], select: { id: true } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
  });
});
