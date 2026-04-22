import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("findUnique_NoMatchingRecords_ReturnsEmptyArray", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findUnique",
    query: { where: { id: 1 } },
  });
});

test("findUnique_ValidQuery_ReturnsFirstRecord", async ({ page, prisma }) => {
  await expectQueryToSucceed({ page, prisma, model: "user", operation: "create", query: { data: { name: "John" } } });
  await expectQueryToSucceed({ page, prisma, model: "user", operation: "findUnique", query: { where: { id: 1 } } });
});
