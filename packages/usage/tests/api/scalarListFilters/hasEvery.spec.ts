import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("hasEvery_TagsInPost_ReturnsFilteredRecords", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "createMany",
    query: {
      data: [
        { title: "Post1", tags: ["First", "Second"] },
        { title: "Post2", tags: ["Third", "Second"] },
        { title: "Post3", tags: ["Second", "Fourth"] },
        { title: "Post4", tags: [] },
        { title: "Post5" },
      ],
    },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
    query: { where: { tags: { hasEvery: ["Second", "Third"] } } },
  });

  // This fails
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
    query: { where: { tags: { hasEvery: [] } } },
  });
});
