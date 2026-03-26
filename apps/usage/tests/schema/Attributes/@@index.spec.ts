import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

// ── ModelWithIndex (@@index([category, priority]), @@index([date])) ──
// @@index doesn't affect querying semantics—records should still be
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
