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

// ── Optional FK index (auto-generated index on nullable foreign key) ──
// Post.authorId is Int? — the auto-generated authorIdIndex must only contain
// records where authorId is non-null. Null-FK records should:
//   a) not appear when querying by a specific authorId value (index path)
//   b) not bleed through when filtering by authorId (correctness)
//   c) still be retrievable via a full scan (they exist in the store)

test("OptionalFkIndex_FindByAuthorId_ExcludesNullFkRecords", async ({ page }) => {
  const user = await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice" } },
  });
  // Two posts with authorId, two without
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "createMany",
    query: {
      data: [
        { title: "Alice post 1", authorId: (user as { id: number }).id },
        { title: "Alice post 2", authorId: (user as { id: number }).id },
        { title: "No author 1" },
        { title: "No author 2" },
      ],
    },
  });
  // Querying by authorId should return only the 2 matched posts
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
    query: { where: { authorId: (user as { id: number }).id } },
  });
});

test("OptionalFkIndex_FindWhereAuthorIdNull_ReturnsThem", async ({ page }) => {
  const user = await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Bob" } },
  });
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "createMany",
    query: {
      data: [
        { title: "Bob post", authorId: (user as { id: number }).id },
        { title: "Orphan post 1" },
        { title: "Orphan post 2" },
      ],
    },
  });
  // Null-FK records must still be retrievable via a full scan
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
    query: { where: { authorId: null } },
  });
});

test("OptionalFkIndex_FindAll_ReturnsNullAndNonNullFkRecords", async ({ page }) => {
  const user = await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { name: "Carol" } },
  });
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "createMany",
    query: {
      data: [{ title: "Carol post", authorId: (user as { id: number }).id }, { title: "No author" }],
    },
  });
  // getAll path — both records should appear
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findMany",
  });
});
