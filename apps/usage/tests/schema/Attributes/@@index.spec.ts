import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

// ── ModelWithIndex (@@index([category, priority]), @@index([date])) ──
// @@index creates non-unique IDB indexes. Records should still be
// creatable/findable/filterable the same way on both Prisma and IDB.

test("ModelWithIndex_Create_SuccessfullyCreatesRecord", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "create",
    query: { data: { category: "urgent", priority: 1, date: new Date("2024-05-01T00:00:00Z") } },
  });
});

test("ModelWithIndex_FindMany_ReturnsMultipleRecords", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "create",
    query: { data: { category: "urgent", priority: 1, date: new Date("2024-05-01T00:00:00Z") } },
  });
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "create",
    query: { data: { category: "low", priority: 5, date: new Date("2024-06-01T00:00:00Z") } },
  });
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "findMany",
  });
});

test("ModelWithIndex_FindMany_FilterByIndexedFields", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "create",
    query: { data: { category: "urgent", priority: 1, date: new Date("2024-05-01T00:00:00Z") } },
  });
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "create",
    query: { data: { category: "low", priority: 5, date: new Date("2024-06-01T00:00:00Z") } },
  });
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "create",
    query: { data: { category: "urgent", priority: 3, date: new Date("2024-07-01T00:00:00Z") } },
  });
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "findMany",
    query: { where: { category: "urgent" } },
  });
});

test("ModelWithIndex_FindMany_OrderByIndexedField", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "create",
    query: { data: { category: "a", priority: 3, date: new Date("2024-05-01T00:00:00Z") } },
  });
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "create",
    query: { data: { category: "b", priority: 1, date: new Date("2024-06-01T00:00:00Z") } },
  });
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "create",
    query: { data: { category: "c", priority: 2, date: new Date("2024-04-01T00:00:00Z") } },
  });
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "findMany",
    query: { orderBy: { priority: "asc" } },
  });
});

test("ModelWithIndex_Update_SuccessfullyUpdatesRecord", async ({ page }) => {
  const result = await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "create",
    query: { data: { category: "urgent", priority: 1, date: new Date("2024-05-01T00:00:00Z") } },
  });
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "update",
    query: { where: { id: (result as { id: number }).id }, data: { priority: 10 } },
  });
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "findMany",
  });
});

test("ModelWithIndex_Delete_SuccessfullyDeletesRecord", async ({ page }) => {
  const result = await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "create",
    query: { data: { category: "urgent", priority: 1, date: new Date("2024-05-01T00:00:00Z") } },
  });
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "delete",
    query: { where: { id: (result as { id: number }).id } },
  });
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "findMany",
  });
});

// ── Index Query Optimization ──
// These tests verify that _getRecords uses indexes for full and prefix
// equality matches, as well as the { equals: ... } wrapper form.

test("ModelWithIndex_FindMany_FullCompositeIndexMatch", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "create",
    query: { data: { category: "a", priority: 1, date: new Date("2024-01-01T00:00:00Z") } },
  });
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "create",
    query: { data: { category: "a", priority: 2, date: new Date("2024-02-01T00:00:00Z") } },
  });
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "create",
    query: { data: { category: "b", priority: 1, date: new Date("2024-03-01T00:00:00Z") } },
  });
  // Full match on [category, priority] — should use IDBKeyRange.only
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "findMany",
    query: { where: { category: "a", priority: 1 } },
  });
});

test("ModelWithIndex_FindMany_PrefixIndexMatch", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "create",
    query: { data: { category: "x", priority: 10, date: new Date("2024-01-01T00:00:00Z") } },
  });
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "create",
    query: { data: { category: "x", priority: 20, date: new Date("2024-02-01T00:00:00Z") } },
  });
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "create",
    query: { data: { category: "y", priority: 10, date: new Date("2024-03-01T00:00:00Z") } },
  });
  // Prefix match on [category] only — should use IDBKeyRange.bound
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "findMany",
    query: { where: { category: "x" } },
  });
});

test("ModelWithIndex_FindMany_EqualsWrapperUsesIndex", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "create",
    query: { data: { category: "m", priority: 5, date: new Date("2024-04-01T00:00:00Z") } },
  });
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "create",
    query: { data: { category: "n", priority: 5, date: new Date("2024-05-01T00:00:00Z") } },
  });
  // { equals: ... } wrapper form — should still resolve to an index match
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "findMany",
    query: { where: { category: { equals: "m" }, priority: { equals: 5 } } },
  });
});

test("ModelWithIndex_FindMany_DateIndexMatch", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "create",
    query: { data: { category: "d", priority: 1, date: new Date("2024-06-15T00:00:00Z") } },
  });
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "create",
    query: { data: { category: "e", priority: 2, date: new Date("2024-07-15T00:00:00Z") } },
  });
  // Single-field date index — should use dateIndex with IDBKeyRange.only
  await expectQueryToSucceed({
    page,
    model: "modelWithIndex",
    operation: "findMany",
    query: { where: { date: new Date("2024-06-15T00:00:00Z") } },
  });
});
