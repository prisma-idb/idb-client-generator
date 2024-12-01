import { test } from "../fixtures";
import { expectQueryToSucceed } from "../queryRunnerHelper";

test("include_WithOneToOneMetaOnOtherRelation_ReturnsRelatedData", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John Doe", profile: { create: { bio: "John's Bio" } } } },
  });
  await expectQueryToSucceed({ page, model: "user", operation: "findMany", query: { include: { profile: true } } });
});

test("include_WithOneToOneMetaOnCurrentRelation_ReturnsRelatedData", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "profile",
    operation: "create",
    query: { data: { bio: "John's Bio", user: { create: { name: "John Doe" } } } },
  });
  await expectQueryToSucceed({ page, model: "profile", operation: "findMany", query: { include: { user: true } } });
});

test("include_WithOneToManyRelation_ReturnsRelatedData", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "John", posts: { create: [{ title: "post1" }, { title: "post2" }] } } },
  });
  await expectQueryToSucceed({ page, model: "user", operation: "findMany", query: { include: { posts: true } } });
});

test("include_WithNestedRelationships_ReturnsAllData", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: {
      data: {
        name: "John",
        posts: {
          create: [
            {
              title: "post1",
              comments: {
                create: [
                  { text: "1st comment", userId: 1, id: "d9lyjcbysitdi9gpjqlfbu7b" },
                  { text: "2nd comment", userId: 1, id: "qjvdd5we849m0xwepeclnemv" },
                ],
              },
            },
            { title: "post2" },
          ],
        },
      },
    },
  });
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: { include: { posts: { include: { comments: true } } } },
  });
});
