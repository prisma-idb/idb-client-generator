import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

// ── CompositeUniqueWithDateTime (@@unique([category, timestamp])) ────

test("CompositeUniqueWithDateTime_Create_SuccessfullyCreatesRecord", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "compositeUniqueWithDateTime",
    operation: "create",
    query: { data: { category: "news", timestamp: new Date("2024-03-10T08:00:00Z") } },
  });
});

test("CompositeUniqueWithDateTime_FindUnique_ByCompositeUnique", async ({ page }) => {
  const timestamp = new Date("2024-03-10T08:00:00Z");
  await expectQueryToSucceed({
    page,
    model: "compositeUniqueWithDateTime",
    operation: "create",
    query: { data: { category: "news", timestamp } },
  });
  await expectQueryToSucceed({
    page,
    model: "compositeUniqueWithDateTime",
    operation: "findUnique",
    query: { where: { category_timestamp: { category: "news", timestamp } } },
  });
});

test("CompositeUniqueWithDateTime_FindUnique_ById", async ({ page }) => {
  const result = await expectQueryToSucceed({
    page,
    model: "compositeUniqueWithDateTime",
    operation: "create",
    query: { data: { category: "news", timestamp: new Date("2024-03-10T08:00:00Z") } },
  });
  await expectQueryToSucceed({
    page,
    model: "compositeUniqueWithDateTime",
    operation: "findUnique",
    query: { where: { id: (result as { id: number }).id } },
  });
});

test("CompositeUniqueWithDateTime_Update_ByCompositeUnique", async ({ page }) => {
  const timestamp = new Date("2024-03-10T08:00:00Z");
  await expectQueryToSucceed({
    page,
    model: "compositeUniqueWithDateTime",
    operation: "create",
    query: { data: { category: "news", timestamp } },
  });
  await expectQueryToSucceed({
    page,
    model: "compositeUniqueWithDateTime",
    operation: "update",
    query: {
      where: { category_timestamp: { category: "news", timestamp } },
      data: { category: "sports" },
    },
  });
  await expectQueryToSucceed({
    page,
    model: "compositeUniqueWithDateTime",
    operation: "findMany",
  });
});

test("CompositeUniqueWithDateTime_FindMany_ReturnsMultipleRecords", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "compositeUniqueWithDateTime",
    operation: "create",
    query: { data: { category: "news", timestamp: new Date("2024-03-10T08:00:00Z") } },
  });
  await expectQueryToSucceed({
    page,
    model: "compositeUniqueWithDateTime",
    operation: "create",
    query: { data: { category: "news", timestamp: new Date("2024-06-15T12:00:00Z") } },
  });
  await expectQueryToSucceed({
    page,
    model: "compositeUniqueWithDateTime",
    operation: "create",
    query: { data: { category: "sports", timestamp: new Date("2024-03-10T08:00:00Z") } },
  });
  await expectQueryToSucceed({
    page,
    model: "compositeUniqueWithDateTime",
    operation: "findMany",
  });
});

// ── CompositeUniqueFloatInt (@@unique([lat, lng]), @@unique([zoneId, lat])) ──

test("CompositeUniqueFloatInt_Create_SuccessfullyCreatesRecord", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "compositeUniqueFloatInt",
    operation: "create",
    query: { data: { lat: 40.7128, lng: -74.006, zoneId: 1 } },
  });
});

test("CompositeUniqueFloatInt_FindUnique_ByLatLng", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "compositeUniqueFloatInt",
    operation: "create",
    query: { data: { lat: 40.7128, lng: -74.006, zoneId: 1 } },
  });
  await expectQueryToSucceed({
    page,
    model: "compositeUniqueFloatInt",
    operation: "findUnique",
    query: { where: { lat_lng: { lat: 40.7128, lng: -74.006 } } },
  });
});

test("CompositeUniqueFloatInt_FindUnique_ByZoneIdLat", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "compositeUniqueFloatInt",
    operation: "create",
    query: { data: { lat: 40.7128, lng: -74.006, zoneId: 1 } },
  });
  await expectQueryToSucceed({
    page,
    model: "compositeUniqueFloatInt",
    operation: "findUnique",
    query: { where: { zoneId_lat: { zoneId: 1, lat: 40.7128 } } },
  });
});

test("CompositeUniqueFloatInt_FindMany_ReturnsMultipleRecords", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "compositeUniqueFloatInt",
    operation: "create",
    query: { data: { lat: 40.7128, lng: -74.006, zoneId: 1 } },
  });
  await expectQueryToSucceed({
    page,
    model: "compositeUniqueFloatInt",
    operation: "create",
    query: { data: { lat: 51.5074, lng: -0.1278, zoneId: 2 } },
  });
  await expectQueryToSucceed({
    page,
    model: "compositeUniqueFloatInt",
    operation: "findMany",
  });
});

// ── MultipleCompositeUniques (@@unique([a,b]), @@unique([c,d]), @@unique([a,c])) ──

test("MultipleCompositeUniques_Create_SuccessfullyCreatesRecord", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "multipleCompositeUniques",
    operation: "create",
    query: {
      data: { a: "hello", b: 42, c: new Date("2024-01-01T00:00:00Z"), d: 3.14 },
    },
  });
});

test("MultipleCompositeUniques_FindUnique_ByAB", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "multipleCompositeUniques",
    operation: "create",
    query: { data: { a: "hello", b: 42, c: new Date("2024-01-01T00:00:00Z"), d: 3.14 } },
  });
  await expectQueryToSucceed({
    page,
    model: "multipleCompositeUniques",
    operation: "findUnique",
    query: { where: { a_b: { a: "hello", b: 42 } } },
  });
});

test("MultipleCompositeUniques_FindUnique_ByCD", async ({ page }) => {
  const c = new Date("2024-01-01T00:00:00Z");
  await expectQueryToSucceed({
    page,
    model: "multipleCompositeUniques",
    operation: "create",
    query: { data: { a: "hello", b: 42, c, d: 3.14 } },
  });
  await expectQueryToSucceed({
    page,
    model: "multipleCompositeUniques",
    operation: "findUnique",
    query: { where: { c_d: { c, d: 3.14 } } },
  });
});

test("MultipleCompositeUniques_FindUnique_ByAC", async ({ page }) => {
  const c = new Date("2024-01-01T00:00:00Z");
  await expectQueryToSucceed({
    page,
    model: "multipleCompositeUniques",
    operation: "create",
    query: { data: { a: "hello", b: 42, c, d: 3.14 } },
  });
  await expectQueryToSucceed({
    page,
    model: "multipleCompositeUniques",
    operation: "findUnique",
    query: { where: { a_c: { a: "hello", c } } },
  });
});

test("MultipleCompositeUniques_Update_ByCompositeUnique", async ({ page }) => {
  const c = new Date("2024-01-01T00:00:00Z");
  await expectQueryToSucceed({
    page,
    model: "multipleCompositeUniques",
    operation: "create",
    query: { data: { a: "hello", b: 42, c, d: 3.14 } },
  });
  await expectQueryToSucceed({
    page,
    model: "multipleCompositeUniques",
    operation: "update",
    query: { where: { a_b: { a: "hello", b: 42 } }, data: { d: 2.71 } },
  });
  await expectQueryToSucceed({
    page,
    model: "multipleCompositeUniques",
    operation: "findMany",
  });
});

test("MultipleCompositeUniques_FindMany_ReturnsMultipleRecords", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "multipleCompositeUniques",
    operation: "create",
    query: { data: { a: "x", b: 1, c: new Date("2024-01-01T00:00:00Z"), d: 1.0 } },
  });
  await expectQueryToSucceed({
    page,
    model: "multipleCompositeUniques",
    operation: "create",
    query: { data: { a: "y", b: 2, c: new Date("2024-06-01T00:00:00Z"), d: 2.0 } },
  });
  await expectQueryToSucceed({
    page,
    model: "multipleCompositeUniques",
    operation: "findMany",
  });
});
