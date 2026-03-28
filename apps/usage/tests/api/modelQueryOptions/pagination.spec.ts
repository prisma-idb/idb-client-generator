import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test.beforeEach(async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "createMany",
    query: {
      data: [{ name: "Alice" }, { name: "Bob" }, { name: "Charlie" }, { name: "Diana" }, { name: "Eve" }],
    },
  });
});

test("take_LimitsResults", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: {
      take: 3,
      orderBy: { id: "asc" },
    },
  });
});

test("skip_SkipsResults", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: {
      skip: 2,
      orderBy: { id: "asc" },
    },
  });
});

test("skipAndTake_CombinedPagination", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: {
      skip: 1,
      take: 2,
      orderBy: { id: "asc" },
    },
  });
});

test("take_NegativeTake_ReturnsFromEnd", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: {
      take: -2,
      orderBy: { id: "asc" },
    },
  });
});

test("cursor_StartFromCursor", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: {
      cursor: { id: 3 },
      orderBy: { id: "asc" },
    },
  });
});

test("cursor_WithTake_LimitsAfterCursor", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: {
      cursor: { id: 2 },
      take: 2,
      orderBy: { id: "asc" },
    },
  });
});

test("cursor_WithSkipAndTake_SkipsFromCursorAndTakes", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: {
      cursor: { id: 2 },
      skip: 1,
      take: 2,
      orderBy: { id: "asc" },
    },
  });
});

test("skip_SkipMoreThanAvailable_ReturnsEmpty", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: {
      skip: 100,
      orderBy: { id: "asc" },
    },
  });
});

test("take_Zero_ReturnsEmpty", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: {
      take: 0,
      orderBy: { id: "asc" },
    },
  });
});

test("findFirst_WithSkip_SkipsBeforePickingFirst", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findFirst",
    query: {
      skip: 2,
      orderBy: { id: "asc" },
    },
  });
});
