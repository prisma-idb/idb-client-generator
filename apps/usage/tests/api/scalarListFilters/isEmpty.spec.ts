import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("isEmpty_GetPostsWithNoTags_ReturnsFilteredRecords", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "createMany",
    query: {
      data: [
        { title: "Post1", tags: ["First", "Second"] },
        { title: "Post2", tags: ["Third"] },
        { title: "EmptyPost", tags: [] },
        { title: "NullPost?" },
      ],
    },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
    query: { where: { tags: { isEmpty: true } } },
  });
});

test("isEmpty_GetPostsWithTags_ReturnsFilteredRecords", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "createMany",
    query: {
      data: [
        { title: "Post1", tags: ["First", "Second"] },
        { title: "Post2", tags: ["Third"] },
        { title: "EmptyPost", tags: [] },
        { title: "NullPost?" },
      ],
    },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
    query: { where: { tags: { isEmpty: false } } },
  });
});
