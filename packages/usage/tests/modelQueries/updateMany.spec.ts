import { test } from "../fixtures";
import { expectQueryToSucceed } from "../queryRunnerHelper";

test("updateMany_ChangeNames_SuccessfullyUpdatesRecord", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "createMany",
    query: { data: [{ name: "John" }, { name: "Alice" }, { name: "Clark" }] },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "updateMany",
    query: { where: { name: { contains: "c", mode: "insensitive" } }, data: { name: "ALICE" } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
  });
});
