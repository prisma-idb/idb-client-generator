import { test } from "../../fixtures";
import { expectQueryToFail, expectQueryToSucceed } from "../../queryRunnerHelper";

test("disconnect_DisconnectExistingRelations_SuccessfullyDisconnects", async ({ page }) => {
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
    query: { where: { id: 1 }, data: { posts: { disconnect: [{ id: 1 }] } } },
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
    query: { include: { author: true }, orderBy: { id: "asc" } },
  });
});

test("disconnect_DisconnectNonExistentRelation_ThrowsError", async ({ page }) => {
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
    query: { where: { id: 1 }, data: { posts: { disconnect: [{ id: 999 }] } } },
    errorMessage: "Record not found",
  });
});

test("disconnect_DisconnectRequiredRelation_ThrowsError", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John", profile: { create: { bio: "John's bio" } } } },
  });

  await expectQueryToFail({
    page,
    model: "user",
    operation: "update",
    query: { where: { id: 1 }, data: { profile: { disconnect: true } } },
    errorMessage: "Cannot disconnect required relation",
  });
});
