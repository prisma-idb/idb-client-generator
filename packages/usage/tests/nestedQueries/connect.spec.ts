import { test } from "../fixtures";
import { expectQueryToSucceed } from "../queryRunnerHelper";

test("connect_ConnectValidPostsToUser_AddsForeignKeysToPosts", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "createMany",
    query: {
      data: [
        { id: 1, title: "post1" },
        { id: 2, title: "post2" },
      ],
    },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John", posts: { connect: [{ id: 1 }, { id: 2 /* conditions in connect */ }] } } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
    query: { include: { author: true } },
  });
});
