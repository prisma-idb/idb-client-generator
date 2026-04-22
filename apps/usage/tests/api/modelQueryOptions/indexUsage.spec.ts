/**
 * Tests that _getRecords uses the correct IDB index when filtering by fields
 * that are involved in same-name scenarios — i.e. a FK field that is also
 * declared @unique (e.g. Profile.userId) or a composite @@id where both
 * component fields also have individual FK secondary indexes (e.g. UserGroup).
 *
 * These cases previously caused either:
 *  - Missing index lookup (Profile fallback to getAll() because unique indexes
 *    were not included in allIndexes), or
 *  - Index name collision (FK index "userId" clashing with the @unique
 *    index "userId" registered for Profile).
 */
import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

// ── Profile: @unique FK (userId) ─────────────────────────────────────
// Profile.userId is both the FK to User and declared @unique. The IDB
// generator must use the "userIdIndex" (a non-primary unique index) when
// filtering by userId, rather than falling back to getAll().

test("indexUsage_UniqueFK_FindManyByUserId_ReturnsCorrectProfile", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "createMany",
    query: { data: [{ name: "Alice" }, { name: "Bob" }] },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "profile",
    operation: "createMany",
    query: {
      data: [
        { bio: "Alice bio", userId: 1 },
        { bio: "Bob bio", userId: 2 },
      ],
    },
  });

  // Filter by userId — should hit userIdIndex, not scan all profiles
  await expectQueryToSucceed({
    page,
    prisma,
    model: "profile",
    operation: "findMany",
    query: { where: { userId: 1 } },
  });
});

test("indexUsage_UniqueFK_FindUniqueByUserId_ReturnsCorrectProfile", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice" } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "profile",
    operation: "create",
    query: { data: { bio: "Alice bio", userId: 1 } },
  });

  await expectQueryToSucceed({
    page,
    prisma,
    model: "profile",
    operation: "findUnique",
    query: { where: { userId: 1 } },
  });
});

test("indexUsage_UniqueFK_FindManyByUserId_NoMatch_ReturnsEmpty", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "create",
    query: { data: { name: "Alice" } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "profile",
    operation: "create",
    query: { data: { bio: "Alice bio", userId: 1 } },
  });

  // userId 999 does not exist — should return [] not all profiles
  await expectQueryToSucceed({
    page,
    prisma,
    model: "profile",
    operation: "findMany",
    query: { where: { userId: 999 } },
  });
});

// ── UserGroup: composite @@id([groupId, userId]) ──────────────────────
// Both component fields have FK secondary indexes. When both equality
// values are present the fast-path should query the primary object store
// directly; when only one is present it should use the corresponding
// secondary index.

test("indexUsage_CompositeKey_BothFields_ReturnsSingleRecord", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "createMany",
    query: { data: [{ name: "Alice" }, { name: "Bob" }] },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "group",
    operation: "createMany",
    query: { data: [{ name: "Admins" }, { name: "Editors" }] },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "userGroup",
    operation: "createMany",
    query: {
      data: [
        { groupId: 1, userId: 1, joinedOn: "2024-01-01T00:00:00.000Z" },
        { groupId: 1, userId: 2, joinedOn: "2024-01-01T00:00:00.000Z" },
        { groupId: 2, userId: 1, joinedOn: "2024-01-01T00:00:00.000Z" },
      ],
    },
  });

  // Full composite key match — hits primary store fast-path
  await expectQueryToSucceed({
    page,
    prisma,
    model: "userGroup",
    operation: "findMany",
    query: { where: { groupId: 1, userId: 2 } },
  });
});

test("indexUsage_CompositeKey_OnlyGroupId_ReturnsAllInGroup", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "createMany",
    query: { data: [{ name: "Alice" }, { name: "Bob" }] },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "group",
    operation: "createMany",
    query: { data: [{ name: "Admins" }, { name: "Editors" }] },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "userGroup",
    operation: "createMany",
    query: {
      data: [
        { groupId: 1, userId: 1, joinedOn: "2024-01-01T00:00:00.000Z" },
        { groupId: 1, userId: 2, joinedOn: "2024-01-01T00:00:00.000Z" },
        { groupId: 2, userId: 1, joinedOn: "2024-01-01T00:00:00.000Z" },
      ],
    },
  });

  // Only groupId — should use groupIdIndex secondary index (2 results)
  await expectQueryToSucceed({
    page,
    prisma,
    model: "userGroup",
    operation: "findMany",
    query: { where: { groupId: 1 } },
  });
});

test("indexUsage_CompositeKey_OnlyUserId_ReturnsAllForUser", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "createMany",
    query: { data: [{ name: "Alice" }, { name: "Bob" }] },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "group",
    operation: "createMany",
    query: { data: [{ name: "Admins" }, { name: "Editors" }] },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "userGroup",
    operation: "createMany",
    query: {
      data: [
        { groupId: 1, userId: 1, joinedOn: "2024-01-01T00:00:00.000Z" },
        { groupId: 2, userId: 1, joinedOn: "2024-01-01T00:00:00.000Z" },
        { groupId: 1, userId: 2, joinedOn: "2024-01-01T00:00:00.000Z" },
      ],
    },
  });

  // Only userId — should use userIdIndex secondary index (2 results)
  await expectQueryToSucceed({
    page,
    prisma,
    model: "userGroup",
    operation: "findMany",
    query: { where: { userId: 1 } },
  });
});

test("indexUsage_CompositeKey_BothFields_NoMatch_ReturnsEmpty", async ({ page, prisma }) => {
  await expectQueryToSucceed({
    page,
    prisma,
    model: "user",
    operation: "createMany",
    query: { data: [{ name: "Alice" }, { name: "Bob" }] },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "group",
    operation: "create",
    query: { data: { name: "Admins" } },
  });
  await expectQueryToSucceed({
    page,
    prisma,
    model: "userGroup",
    operation: "create",
    query: { data: { groupId: 1, userId: 1, joinedOn: "2024-01-01T00:00:00.000Z" } },
  });

  // groupId:1, userId:2 does not exist — composite fast-path should return []
  await expectQueryToSucceed({
    page,
    prisma,
    model: "userGroup",
    operation: "findMany",
    query: { where: { groupId: 1, userId: 2 } },
  });
});
