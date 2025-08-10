import type { Comment, Post, UserGroup } from "@prisma/client";
import { expect, test } from "../../fixtures";
import { expectQueryToSucceed, runQuery } from "../../queryRunnerHelper";

test("@default(autoincrement) - Creates new post with auto-increment ID", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "create",
    query: {
      data: { title: "Test Post" },
    },
  });

  const response: Post[] = (await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
    query: {},
  })) as Post[];

  // Check that 'id' has been auto-incremented
  expect(response[0].id).toBeGreaterThan(0);
});

test("@default(cuid(2)) - Creates new comment with cuid generated ID", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: {
      data: { name: "Test User" },
    },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "create",
    query: {
      data: { title: "Test Post" },
    },
  });

  const { idbClientResult } = await runQuery({
    page,
    model: "comment",
    operation: "create",
    query: {
      data: { text: "Comment with cuid default", postId: 1, userId: 1 },
    },
  });
  expect(typeof (idbClientResult as Comment).id).toBe("string");
  expect((idbClientResult as Comment).id).toHaveLength(24); // typical length of cuid
});

test("@default(now()) - Creates new userGroup with current date", async ({ page }) => {
  const { idbClientResult } = await runQuery({
    page,
    model: "userGroup",
    operation: "create",
    query: {
      data: {
        group: { create: { name: "DefaultNow Group" } },
        user: { create: { name: "DefaultNow User" } },
      },
    },
  });

  // joinedOn should be near current time
  expect(new Date((idbClientResult as UserGroup).joinedOn).getTime() / 1000).toBeCloseTo(
    new Date().getTime() / 1000,
    0,
  );
});

test("@default(uuid()) - Creates new TestUuid entry with uuid generated ID", async ({ page }) => {
  const { idbClientResult } = await runQuery({
    page,
    model: "testUuid",
    operation: "create",
    query: {
      data: { name: "UUID Default Test" },
    },
  });

  expect(typeof idbClientResult.id).toBe("string");
  expect(idbClientResult.id).toHaveLength(36);
  expect(idbClientResult.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
});

// TODO: others with all possible params
