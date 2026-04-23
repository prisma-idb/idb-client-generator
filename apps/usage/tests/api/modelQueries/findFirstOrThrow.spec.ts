import { test } from "../../fixtures";
import { expectQueryToFail, expectQueryToSucceed } from "../../queryRunnerHelper";

test("findFirstOrThrow_NoMatchingRecords_ThrowsError", async ({ page, prisma }) => {
  await expectQueryToFail({
    page,
    prisma,
    model: "user",
    operation: "findFirstOrThrow",
    errorMessage: "Record not found",
  });
});

test("findFirstOrThrow_ValidQuery_ReturnsFirstRecord", async ({ page, prisma }) => {
  await expectQueryToSucceed({ page, prisma, model: "user", operation: "create", query: { data: { name: "John" } } });
  await expectQueryToSucceed({ page, prisma, model: "user", operation: "findFirstOrThrow" });
});
