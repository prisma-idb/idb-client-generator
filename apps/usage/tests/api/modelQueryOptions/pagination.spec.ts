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

test("cursor_WithNegativeTake_ReturnsRecordsBeforeCursor", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: {
      cursor: { id: 4 },
      take: -2,
      orderBy: { id: "asc" },
    },
  });
});

test("cursor_WithNegativeTakeAndSkip_SkipsBackwardFromCursor", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: {
      cursor: { id: 5 },
      skip: 1,
      take: -2,
      orderBy: { id: "asc" },
    },
  });
});

test("cursor_WithNegativeTakeOne_ReturnsSingleRecordBeforeCursor", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: {
      cursor: { id: 3 },
      take: -1,
      orderBy: { id: "asc" },
    },
  });
});

test("cursor_WithDistinct_PaginatesCorrectlyAfterDistinctFiltering", async ({ page }) => {
  // beforeEach creates: Alice(1), Bob(2), Charlie(3), Diana(4), Eve(5)
  // Add duplicates so distinct removes records BEFORE the cursor in name order
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "createMany",
    query: {
      data: [{ name: "Alice" }, { name: "Alice" }, { name: "Bob" }, { name: "Charlie" }, { name: "Charlie" }],
    },
  });
  // Order by name so duplicates are adjacent; cursor at id=3 (Charlie) is
  // after removed duplicates, causing index desync between
  // relationAppliedRecords and selectAppliedRecords
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: {
      cursor: { id: 3 },
      distinct: ["name"],
      take: 2,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    },
  });
});

test("cursor_WithSelectExcludingCursorField_PaginatesCorrectly", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: {
      cursor: { id: 3 },
      take: 2,
      select: { name: true },
      orderBy: { id: "asc" },
    },
  });
});

test("cursor_WithNegativeTakeAndSelectExcludingCursorField_PaginatesCorrectly", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: {
      cursor: { id: 4 },
      take: -2,
      select: { name: true },
      orderBy: { id: "asc" },
    },
  });
});

test("cursor_WithSkipTakeAndSelectExcludingCursorField_PaginatesCorrectly", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: {
      cursor: { id: 2 },
      skip: 1,
      take: 2,
      select: { name: true },
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

test("skip_Zero_ReturnsAllResults", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "findMany",
    query: {
      skip: 0,
      orderBy: { id: "asc" },
    },
  });
});
