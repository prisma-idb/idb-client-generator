import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("set_SetNewTags_SuccessfullySetTags", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "post",
    operation: "create",
    query: { data: { title: "Post1" } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "post",
    operation: "update",
    query: { where: { id: 1 }, data: { tags: { set: ["Tag1", "Tag2"] } } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "post",
    operation: "findMany",
  });
});

test("set_OverwriteExistingTags_SuccessfullyChangesTags", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "post",
    operation: "create",
    query: { data: { title: "Post1", tags: ["Tag1", "Tag2"] } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "post",
    operation: "update",
    query: { where: { id: 1 }, data: { tags: { set: ["Tag3", "Tag4"] } } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "post",
    operation: "findMany",
  });
});
