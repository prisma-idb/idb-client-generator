import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("createManyAndReturn_SelectParticulars_SuccessfullyCreatesAndReturnsRecords", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "createManyAndReturn",
    query: { data: [{ name: "John Doe" }, { name: "Alice" }], select: { id: true } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findMany",
  });
});
