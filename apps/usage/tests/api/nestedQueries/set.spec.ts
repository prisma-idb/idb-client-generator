import { test } from "../../fixtures";
import { expectQueryToSucceed, expectQueryToFail } from "../../queryRunnerHelper";

test("set_DisconnectExistingRelations_SuccessfullyDisconnects", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John", posts: { create: [{ title: "Post1" }, { title: "Post2" }] } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { posts: { set: [] } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { include: { posts: true } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
    query: { include: { author: true } },
  });
});

test("set_NestedSetQuery_SuccessfullySetsNestedRelations", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John" } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "create",
    query: { data: { title: "Post1" } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { posts: { set: [{ id: 1 }] } } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { include: { posts: true } },
  });
});

test("set_InvalidSetQuery_ThrowsError", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John" } },
  });

  await expectQueryToFail({
    page,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { posts: { set: [{ id: 999 }] } } },
    errorMessage: "Record not found",
  });
});
