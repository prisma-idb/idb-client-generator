import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("setNull_DeleteUserWithPosts_SetsUserIdToNull", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John Doe", posts: { create: { title: "Post1" } } } },
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
    query: { where: { authorId: null } },
  });
});
