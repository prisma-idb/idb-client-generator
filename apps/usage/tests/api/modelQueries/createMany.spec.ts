import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("createMany_ValidData_SuccessfullyCreatesRecords", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "createMany",
    query: { data: [{ name: "John Doe" }, { name: "Alice" }] },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findMany",
  });
});
