import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("cascade_DeleteParentRecord_DeletesChildRecords", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John", posts: { create: [{ title: "Post1" }, { title: "Post2" }] } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "delete",
    query: { where: { id: 1 } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
    query: { where: { authorId: 1 } },
  });
});

test("cascade_DeleteParentRecordWithNoChildren_Success", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice" } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "delete",
    query: { where: { id: 1 } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
  });
});

test("cascade_DeleteParentRecordWithMixedChildren_DeletesOnlyRelatedChildren", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John", posts: { create: [{ title: "Post1" }, { title: "Post2" }] } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice", posts: { create: [{ title: "Post3" }] } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "delete",
    query: { where: { id: 1 } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
    query: { where: { authorId: 2 } },
  });
});
