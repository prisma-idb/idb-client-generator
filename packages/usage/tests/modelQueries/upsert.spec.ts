import { test } from "../fixtures";
import { expectQueryToSucceed } from "../queryRunnerHelper";

test("upsert_ChangeId_SuccessfullyUpdatesRecord", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "upsert",
    query: { where: { id: 1 }, create: { id: 1, name: "John" }, update: { name: "Alice" } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "upsert",
    query: { where: { id: 1 }, create: { name: "Alice" }, update: { id: 3 } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
  });
});
