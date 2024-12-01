import { test } from "../fixtures";
import { expectQueryToSucceed } from "../queryRunnerHelper";

test("push_AddTagToPost_SuccessfullyAppendTag", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "create",
    query: { data: { title: "Post1" } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "update",
    query: { where: { id: 1 }, data: { tags: { push: "Tag1" } } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
  });
});

test("push_AddMultipleTagsToPost_SuccessfullyAppendTags", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "create",
    query: { data: { title: "Post1", tags: { set: ["Tag1"] } } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "update",
    query: { where: { id: 1 }, data: { tags: { push: ["Tag2", "Tag3"] } } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
  });
});
