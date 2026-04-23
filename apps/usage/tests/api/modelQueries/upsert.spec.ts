import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("upsert_ChangeId_SuccessfullyUpdatesRecord", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "upsert",
    query: { where: { id: 1 }, create: { id: 1, name: "John" }, update: { name: "Alice" } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "upsert",
    query: { where: { id: 1 }, create: { name: "Alice" }, update: { id: 3 } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findMany",
  });
});
