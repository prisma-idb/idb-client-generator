/**
 * Regression: auto-migration across contract evolution.
 *
 * The first sweep through `createAutoMigratingIdbClient` bootstraps the DB
 * with v1. Re-opening with a v2 contract that adds a store must produce a
 * delta plan (only the new store), not a "from scratch" plan that would try
 * to recreate the existing store and abort with `ConstraintError`.
 */
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineContract } from "@prisma-next-idb/family-idb/contract-ts";
import idbFamilyPack from "@prisma-next-idb/family-idb/pack";
import idbTargetPack from "@prisma-next-idb/target-idb/pack";
import { createAutoMigratingIdbClient } from "../src/exports/client-auto";
import type { IdbStoreAccessor } from "../src/exports/orm";

// Mapped-type clients have an index signature; bracket access via this helper
// avoids TS4111 (`Property X comes from an index signature`).
function asRecord(orm: unknown): Record<string, IdbStoreAccessor<never, never>> {
  return orm as Record<string, IdbStoreAccessor<never, never>>;
}

let dbCounter = 0;
function dbName(): string {
  return `auto-mig-evolve-${++dbCounter}`;
}

const v1 = defineContract({
  family: idbFamilyPack,
  target: idbTargetPack,
  models: {
    User: { store: "users", key: "id", fields: { id: "String", email: "String" } },
  },
});

const v2 = defineContract({
  family: idbFamilyPack,
  target: idbTargetPack,
  models: {
    User: { store: "users", key: "id", fields: { id: "String", email: "String" } },
    Post: { store: "posts", key: "id", fields: { id: "String", title: "String" } },
  },
});

const v3 = defineContract({
  family: idbFamilyPack,
  target: idbTargetPack,
  models: {
    User: {
      store: "users",
      key: "id",
      fields: { id: "String", email: "String" },
      indexes: { byEmail: { keyPath: "email", unique: true } },
    },
    Post: { store: "posts", key: "id", fields: { id: "String", title: "String" } },
  },
});

describe("auto-migrate across contract evolution", () => {
  // Reset fake-indexeddb between tests so db names don't leak state.
  // The default IDBFactory export from `fake-indexeddb` constructs a fresh
  // implementation; reassigning the global mirrors what `fake-indexeddb/auto`
  // does on initial setup.
  beforeEach(async () => {
    const fake: { IDBFactory: new () => IDBFactory } = await import("fake-indexeddb");
    (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new fake.IDBFactory();
  });
  afterEach(async () => {
    const fake: { IDBFactory: new () => IDBFactory } = await import("fake-indexeddb");
    (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new fake.IDBFactory();
  });

  it("v1 → v2 adds a store without re-creating existing ones", async () => {
    const name = dbName();

    const c1 = await createAutoMigratingIdbClient({ contract: v1, dbName: name });
    const orm1 = asRecord(c1.orm);
    await orm1["users"]!.create({ id: "u1", email: "alice@example.com" });
    expect(await orm1["users"]!.findUnique("u1")).toMatchObject({ id: "u1" });
    await c1.close();

    const c2 = await createAutoMigratingIdbClient({ contract: v2, dbName: name });
    const orm2 = asRecord(c2.orm);
    const users = await orm2["users"]!.all().toArray();
    expect(users).toHaveLength(1);
    await orm2["posts"]!.create({ id: "p1", title: "Hello" });
    const posts = await orm2["posts"]!.all().toArray();
    expect(posts).toHaveLength(1);
    await c2.close();
  });

  it("v2 → v3 adds a new index to an existing store", async () => {
    const name = dbName();

    const c2 = await createAutoMigratingIdbClient({ contract: v2, dbName: name });
    await asRecord(c2.orm)["users"]!.create({ id: "u1", email: "alice@example.com" });
    await c2.close();

    const c3 = await createAutoMigratingIdbClient({ contract: v3, dbName: name });
    const users = await asRecord(c3.orm)["users"]!.all().toArray();
    expect(users).toHaveLength(1);
    await c3.close();
  });

  it("repeated open with same contract is a no-op", async () => {
    const name = dbName();

    const c1a = await createAutoMigratingIdbClient({ contract: v1, dbName: name });
    await asRecord(c1a.orm)["users"]!.create({ id: "u1", email: "alice@example.com" });
    await c1a.close();

    // Re-opening with identical contract should not throw and should not
    // need to bump the IDB version.
    const c1b = await createAutoMigratingIdbClient({ contract: v1, dbName: name });
    const users = await asRecord(c1b.orm)["users"]!.all().toArray();
    expect(users).toHaveLength(1);
    await c1b.close();
  });

  it("v3 → v3-tightened reflects a flipped index unique flag (Issue #15 e2e)", async () => {
    // The contract authors take an existing byEmail index with unique:true
    // and remove it (v3-loosened drops the index entirely). The diff must
    // emit a dropIndex op rather than a no-op.
    const v3Loosened = defineContract({
      family: idbFamilyPack,
      target: idbTargetPack,
      models: {
        User: {
          store: "users",
          key: "id",
          fields: { id: "String", email: "String" },
          // no indexes
        },
        Post: { store: "posts", key: "id", fields: { id: "String", title: "String" } },
      },
    });

    const name = dbName();
    const c3 = await createAutoMigratingIdbClient({ contract: v3, dbName: name });
    await asRecord(c3.orm)["users"]!.create({ id: "u1", email: "alice@example.com" });
    await c3.close();

    const c3l = await createAutoMigratingIdbClient({ contract: v3Loosened, dbName: name });
    // After loosening, two users with the same email must not throw
    // (the unique constraint is gone).
    await asRecord(c3l.orm)["users"]!.create({ id: "u2", email: "alice@example.com" });
    const users = await asRecord(c3l.orm)["users"]!.all().toArray();
    expect(users).toHaveLength(2);
    await c3l.close();
  });
});
