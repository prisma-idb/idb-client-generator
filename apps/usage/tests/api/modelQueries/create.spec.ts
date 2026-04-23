import { test } from "../../fixtures";
import { expectQueryToFail, expectQueryToSucceed } from "../../queryRunnerHelper";

test("create_ValidData_SuccessfullyCreatesRecord", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { id: 1, name: "John Doe" } },
  });
});

test("create_NonExistentForeignKey_ShouldFail", async ({ page, prisma }) => {
  await expectQueryToFail({
    page,
    prisma,
    model: "profile",
    operation: "create",
    query: { data: { bio: "John's bio", userId: 7 } },
    errorMessage: "Record not found",
  });
});
