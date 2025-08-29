import { expect, test } from "../fixtures";
import { expectQueryToSucceed, runQuery } from "../queryRunnerHelper";

test("autoDeletedAtFilter_ValidQuery_ReturnsFilteredRecords", async ({ page }) => {
  await expectQueryToSucceed({ page, model: "modelWithDeletedAt", operation: "create", query: { data: { id: 1 } } });
  await expectQueryToSucceed({ page, model: "modelWithDeletedAt", operation: "findFirst" });

  await expectQueryToSucceed({
    page,
    model: "modelWithDeletedAt",
    operation: "update",
    query: { where: { id: 1 }, data: { deletedAt: new Date() } },
  });

  {
    const { idbClientResult, prismaClientResult } = await runQuery({
      page,
      model: "modelWithDeletedAt",
      operation: "findMany",
    });

    expect((idbClientResult as Array<unknown>).length).toBe(0);
    expect((prismaClientResult as Array<unknown>).length).toBe(1);
  }

  {
    const { idbClientResult, prismaClientResult } = await runQuery({
      page,
      model: "modelWithDeletedAt",
      operation: "findMany",
      query: { where: { deletedAt: null } },
    });

    expect((idbClientResult as Array<unknown>).length).toBe(0);
    expect((prismaClientResult as Array<unknown>).length).toBe(0);
  }
});
