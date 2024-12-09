import { test } from "../fixtures";
import { expectQueryToSucceed } from "../queryRunnerHelper";

test("arrayModifier_CreatePostWithoutTags_AssignsUndefinedAsDefault", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "create",
    query: { data: { title: "Post1" } },
  });
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "create",
    query: { data: { title: "Post2", tags: [] } },
  });
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "create",
    query: { data: { title: "Post3", tags: ["tag1"] } },
  });
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
  });
});

test("arrayModifier_CreatePostWithEmptyArray_AssignsEmptyArray", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "create",
    query: { data: { title: "Post1", tags: [] } },
  });
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
  });
});
