import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("@@id_CreateRecordWithCompositeKey_SuccessfullyCreatesRecord", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "mother",
    operation: "create",
    query: { data: { firstName: "Alice", lastName: "Doe" } },
  });
  await expectQueryToSucceed({ page, prisma, model: "mother", operation: "findMany" });
});

test("@@id_CreateRelatedRecords_SuccessfullyCreatesRecords", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "mother",
    operation: "create",
    query: { data: { firstName: "Alice", lastName: "Doe" } },
  });
  await expectQueryToSucceed({ page, prisma, model: "mother", operation: "findMany" });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "father",
    operation: "create",
    query: {
      data: {
        firstName: "John",
        lastName: "Doe",
        wife: { connect: { firstName_lastName: { firstName: "Alice", lastName: "Doe" } } },
      },
    },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "father",
    operation: "findMany",
    query: { include: { wife: true } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "mother",
    operation: "findMany",
    query: { include: { husband: true } },
  });
});

test("@@id_CreateNestedRecords_SuccessfullyCreatesRecords", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "mother",
    operation: "create",
    query: {
      data: {
        firstName: "Alice",
        lastName: "Doe",
        husband: { create: { firstName: "John", lastName: "Doe" } },
        children: {
          create: { childFirstName: "Robert", childLastName: "Doe", fatherFirstName: "John", fatherLastName: "Doe" },
        },
      },
    },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "father",
    operation: "findMany",
    query: { include: { wife: true, children: true } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "mother",
    operation: "findMany",
    query: { include: { husband: true, children: true } },
  });
});

test("@@id_CreateFatherAndMotherDuringChildCreation_SuccessfullyRearrangesDeps", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "child",
    operation: "create",
    query: {
      data: {
        childFirstName: "Robert",
        childLastName: "Doe",
        father: {
          create: {
            firstName: "John",
            lastName: "Doe",
            wife: { connect: { firstName_lastName: { firstName: "Alice", lastName: "Doe" } } },
          },
        },
        mother: { create: { firstName: "Alice", lastName: "Doe" } },
      },
    },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "father",
    operation: "findMany",
    query: { include: { wife: true, children: true } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "mother",
    operation: "findMany",
    query: { include: { husband: true, children: true } },
  });
});

test("@@id_CreateDeeplyNestedRecords_SuccessfullyCreatesRecords", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "mother",
    operation: "create",
    query: {
      data: {
        firstName: "Alice",
        lastName: "Doe",
        husband: { create: { firstName: "John", lastName: "Doe", user: { create: { name: "JohnDoe456" } } } },
        user: { create: { name: "AliceDoe123" } },
      },
    },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "father",
    operation: "findMany",
    query: { include: { wife: true, children: true, user: true } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "mother",
    operation: "findMany",
    query: { include: { husband: true, children: true, user: true } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "findMany",
    query: { include: { Mother: true, Father: true, Child: true } },
  });
});

// ── CompositeIdIntString (@@id([orgId, code])) ───────────────────────

test("CompositeIdIntString_Create_SuccessfullyCreatesRecord", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdIntString",
    operation: "create",
    query: { data: { orgId: 1, code: "ABC", details: "first" } },
  });
});

test("CompositeIdIntString_FindUnique_ReturnsRecord", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdIntString",
    operation: "create",
    query: { data: { orgId: 1, code: "ABC", details: "first" } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdIntString",
    operation: "findUnique",
    query: { where: { orgId_code: { orgId: 1, code: "ABC" } } },
  });
});

test("CompositeIdIntString_Update_SuccessfullyUpdatesRecord", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdIntString",
    operation: "create",
    query: { data: { orgId: 1, code: "ABC", details: "first" } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdIntString",
    operation: "update",
    query: { where: { orgId_code: { orgId: 1, code: "ABC" } }, data: { details: "updated" } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdIntString",
    operation: "findUnique",
    query: { where: { orgId_code: { orgId: 1, code: "ABC" } } },
  });
});

test("CompositeIdIntString_Delete_SuccessfullyDeletesRecord", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdIntString",
    operation: "create",
    query: { data: { orgId: 1, code: "ABC", details: "first" } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdIntString",
    operation: "delete",
    query: { where: { orgId_code: { orgId: 1, code: "ABC" } } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdIntString",
    operation: "findMany",
  });
});

test("CompositeIdIntString_FindMany_ReturnsMultipleRecords", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdIntString",
    operation: "create",
    query: { data: { orgId: 1, code: "ABC" } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdIntString",
    operation: "create",
    query: { data: { orgId: 1, code: "DEF" } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdIntString",
    operation: "create",
    query: { data: { orgId: 2, code: "ABC" } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdIntString",
    operation: "findMany",
  });
});

// ── CompositeIdWithDateTime (@@id([tenantId, createdAt])) ────────────

test("CompositeIdWithDateTime_Create_SuccessfullyCreatesRecord", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdWithDateTime",
    operation: "create",
    query: { data: { tenantId: "t1", createdAt: new Date("2024-01-15T10:00:00Z"), label: "first" } },
  });
});

test("CompositeIdWithDateTime_FindUnique_ReturnsRecord", async ({ page, prisma }) => {
  const date = new Date("2024-01-15T10:00:00Z");
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdWithDateTime",
    operation: "create",
    query: { data: { tenantId: "t1", createdAt: date, label: "first" } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdWithDateTime",
    operation: "findUnique",
    query: { where: { tenantId_createdAt: { tenantId: "t1", createdAt: date } } },
  });
});

test("CompositeIdWithDateTime_Update_SuccessfullyUpdatesRecord", async ({ page, prisma }) => {
  const date = new Date("2024-01-15T10:00:00Z");
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdWithDateTime",
    operation: "create",
    query: { data: { tenantId: "t1", createdAt: date, label: "first" } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdWithDateTime",
    operation: "update",
    query: { where: { tenantId_createdAt: { tenantId: "t1", createdAt: date } }, data: { label: "updated" } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdWithDateTime",
    operation: "findUnique",
    query: { where: { tenantId_createdAt: { tenantId: "t1", createdAt: date } } },
  });
});

test("CompositeIdWithDateTime_Delete_SuccessfullyDeletesRecord", async ({ page, prisma }) => {
  const date = new Date("2024-01-15T10:00:00Z");
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdWithDateTime",
    operation: "create",
    query: { data: { tenantId: "t1", createdAt: date, label: "first" } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdWithDateTime",
    operation: "delete",
    query: { where: { tenantId_createdAt: { tenantId: "t1", createdAt: date } } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdWithDateTime",
    operation: "findMany",
  });
});

test("CompositeIdWithDateTime_FindMany_ReturnsMultipleRecords", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdWithDateTime",
    operation: "create",
    query: { data: { tenantId: "t1", createdAt: new Date("2024-01-15T10:00:00Z"), label: "a" } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdWithDateTime",
    operation: "create",
    query: { data: { tenantId: "t1", createdAt: new Date("2024-06-20T15:30:00Z"), label: "b" } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdWithDateTime",
    operation: "create",
    query: { data: { tenantId: "t2", createdAt: new Date("2024-01-15T10:00:00Z"), label: "c" } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdWithDateTime",
    operation: "findMany",
  });
});

// ── TripleCompositeIdWithDate (@@id([region, year, eventDate])) ──────

test("TripleCompositeIdWithDate_Create_SuccessfullyCreatesRecord", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "tripleCompositeIdWithDate",
    operation: "create",
    query: {
      data: { region: "US", year: 2024, eventDate: new Date("2024-07-04T00:00:00Z"), payload: "fireworks" },
    },
  });
});

test("TripleCompositeIdWithDate_FindUnique_ReturnsRecord", async ({ page, prisma }) => {
  const eventDate = new Date("2024-07-04T00:00:00Z");
  await expectQueryToSucceed({
    page,
    prisma,
    model: "tripleCompositeIdWithDate",
    operation: "create",
    query: { data: { region: "US", year: 2024, eventDate, payload: "fireworks" } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "tripleCompositeIdWithDate",
    operation: "findUnique",
    query: { where: { region_year_eventDate: { region: "US", year: 2024, eventDate } } },
  });
});

test("TripleCompositeIdWithDate_Update_SuccessfullyUpdatesRecord", async ({ page, prisma }) => {
  const eventDate = new Date("2024-07-04T00:00:00Z");
  await expectQueryToSucceed({
    page,
    prisma,
    model: "tripleCompositeIdWithDate",
    operation: "create",
    query: { data: { region: "US", year: 2024, eventDate, payload: "fireworks" } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "tripleCompositeIdWithDate",
    operation: "update",
    query: {
      where: { region_year_eventDate: { region: "US", year: 2024, eventDate } },
      data: { payload: "sparklers" },
    },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "tripleCompositeIdWithDate",
    operation: "findUnique",
    query: { where: { region_year_eventDate: { region: "US", year: 2024, eventDate } } },
  });
});

test("TripleCompositeIdWithDate_FindMany_ReturnsMultipleRecords", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "tripleCompositeIdWithDate",
    operation: "create",
    query: { data: { region: "US", year: 2024, eventDate: new Date("2024-07-04T00:00:00Z") } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "tripleCompositeIdWithDate",
    operation: "create",
    query: { data: { region: "EU", year: 2024, eventDate: new Date("2024-12-25T00:00:00Z") } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "tripleCompositeIdWithDate",
    operation: "findMany",
    query: { orderBy: { region: "asc" } },
  });
});

// ── DateTime Composite Key Cursor Pagination ────────────────────────

test("CompositeIdWithDateTime_Cursor_FindsRecordByDateTimeCursor", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdWithDateTime",
    operation: "createMany",
    query: {
      data: [
        { tenantId: "t1", createdAt: new Date("2024-01-01T00:00:00Z"), label: "a" },
        { tenantId: "t1", createdAt: new Date("2024-02-01T00:00:00Z"), label: "b" },
        { tenantId: "t1", createdAt: new Date("2024-03-01T00:00:00Z"), label: "c" },
        { tenantId: "t1", createdAt: new Date("2024-04-01T00:00:00Z"), label: "d" },
      ],
    },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdWithDateTime",
    operation: "findMany",
    query: {
      cursor: { tenantId_createdAt: { tenantId: "t1", createdAt: new Date("2024-02-01T00:00:00Z") } },
      take: 2,
      orderBy: { createdAt: "asc" },
    },
  });
});

test("CompositeIdWithDateTime_CursorWithNegativeTake_BackwardFromDateTimeCursor", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdWithDateTime",
    operation: "createMany",
    query: {
      data: [
        { tenantId: "t1", createdAt: new Date("2024-01-01T00:00:00Z"), label: "a" },
        { tenantId: "t1", createdAt: new Date("2024-02-01T00:00:00Z"), label: "b" },
        { tenantId: "t1", createdAt: new Date("2024-03-01T00:00:00Z"), label: "c" },
        { tenantId: "t1", createdAt: new Date("2024-04-01T00:00:00Z"), label: "d" },
      ],
    },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdWithDateTime",
    operation: "findMany",
    query: {
      cursor: { tenantId_createdAt: { tenantId: "t1", createdAt: new Date("2024-03-01T00:00:00Z") } },
      take: -2,
      orderBy: { createdAt: "asc" },
    },
  });
});

// ── Composite Key Cursor Pagination ─────────────────────────────────

const compositeIdIntStringSeed = [
  { orgId: 1, code: "AAA" },
  { orgId: 1, code: "BBB" },
  { orgId: 1, code: "CCC" },
  { orgId: 2, code: "AAA" },
  { orgId: 2, code: "BBB" },
];

test("CompositeIdIntString_Cursor_StartFromCompositeCursor", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdIntString",
    operation: "createMany",
    query: { data: compositeIdIntStringSeed },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdIntString",
    operation: "findMany",
    query: {
      cursor: { orgId_code: { orgId: 1, code: "BBB" } },
      orderBy: [{ orgId: "asc" }, { code: "asc" }],
    },
  });
});

test("CompositeIdIntString_CursorWithTake_LimitsAfterCompositeCursor", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdIntString",
    operation: "createMany",
    query: { data: compositeIdIntStringSeed },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdIntString",
    operation: "findMany",
    query: {
      cursor: { orgId_code: { orgId: 1, code: "BBB" } },
      take: 2,
      orderBy: [{ orgId: "asc" }, { code: "asc" }],
    },
  });
});

test("CompositeIdIntString_CursorWithNegativeTake_ReturnsBeforeCursor", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdIntString",
    operation: "createMany",
    query: { data: compositeIdIntStringSeed },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdIntString",
    operation: "findMany",
    query: {
      cursor: { orgId_code: { orgId: 2, code: "AAA" } },
      take: -2,
      orderBy: [{ orgId: "asc" }, { code: "asc" }],
    },
  });
});

test("CompositeIdIntString_CursorWithSkipAndTake_PaginatesCorrectly", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdIntString",
    operation: "createMany",
    query: { data: compositeIdIntStringSeed },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "compositeIdIntString",
    operation: "findMany",
    query: {
      cursor: { orgId_code: { orgId: 1, code: "BBB" } },
      skip: 1,
      take: 2,
      orderBy: [{ orgId: "asc" }, { code: "asc" }],
    },
  });
});
