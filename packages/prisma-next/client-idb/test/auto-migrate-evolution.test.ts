/**
 * Auto-migration across contract evolution.
 *
 * `createAutoMigratingIdbClient` consumes a bundled `ContractSpace`
 * (assembled at design time by `prisma-next-idb generate-contract-space`)
 * and walks its `migrations` array from the current marker to `headRef.hash`.
 * The browser-side path never re-runs the planner — it just applies the
 * pre-computed `ops.json` blobs in chain order.
 *
 * These tests construct the contract space in-memory via
 * {@link buildContractSpaceFixture}, simulating what the codegen would emit
 * if the user had run `migration new` once per version.
 */
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineContract } from "@prisma-next-idb/family-idb/contract-ts";
import idbFamilyPack from "@prisma-next-idb/family-idb/pack";
import idbTargetPack from "@prisma-next-idb/target-idb/pack";
import { createAutoMigratingIdbClient } from "../src/exports/client-auto";
import type { IdbStoreAccessor } from "../src/exports/orm";
import { buildContractSpaceFixture } from "./_contract-space-fixture";

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
  beforeEach(async () => {
    const fake: { IDBFactory: new () => IDBFactory } = await import("fake-indexeddb");
    (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new fake.IDBFactory();
  });
  afterEach(async () => {
    const fake: { IDBFactory: new () => IDBFactory } = await import("fake-indexeddb");
    (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new fake.IDBFactory();
  });

  it("v1 → v2 walks an extra migration package without re-creating existing stores", async () => {
    const name = dbName();

    // Day-1 deployment: one migration package (null → v1).
    const space1 = buildContractSpaceFixture([v1]);
    const c1 = await createAutoMigratingIdbClient({ contractSpace: space1, dbName: name });
    const orm1 = asRecord(c1.orm);
    await orm1["users"]!.create({ id: "u1", email: "alice@example.com" });
    await c1.close();

    // Day-2 deployment: chain has both v1 and v2. Tab opens at marker v1,
    // walks the v1→v2 package only.
    const space2 = buildContractSpaceFixture([v1, v2]);
    const c2 = await createAutoMigratingIdbClient({ contractSpace: space2, dbName: name });
    const orm2 = asRecord(c2.orm);
    const users = await orm2["users"]!.all().toArray();
    expect(users).toHaveLength(1); // existing data preserved
    await orm2["posts"]!.create({ id: "p1", title: "Hello" });
    expect(await orm2["posts"]!.all().toArray()).toHaveLength(1);
    await c2.close();
  });

  it("v2 → v3 adds an index without destroying existing rows", async () => {
    const name = dbName();

    const space2 = buildContractSpaceFixture([v1, v2]);
    const c2 = await createAutoMigratingIdbClient({ contractSpace: space2, dbName: name });
    await asRecord(c2.orm)["users"]!.create({ id: "u1", email: "alice@example.com" });
    await c2.close();

    const space3 = buildContractSpaceFixture([v1, v2, v3]);
    const c3 = await createAutoMigratingIdbClient({ contractSpace: space3, dbName: name });
    expect(await asRecord(c3.orm)["users"]!.all().toArray()).toHaveLength(1);
    await c3.close();
  });

  it("repeated open with same contract space is a no-op", async () => {
    const name = dbName();
    const space1 = buildContractSpaceFixture([v1]);

    const c1a = await createAutoMigratingIdbClient({ contractSpace: space1, dbName: name });
    await asRecord(c1a.orm)["users"]!.create({ id: "u1", email: "alice@example.com" });
    await c1a.close();

    const c1b = await createAutoMigratingIdbClient({ contractSpace: space1, dbName: name });
    expect(await asRecord(c1b.orm)["users"]!.all().toArray()).toHaveLength(1);
    await c1b.close();
  });

  it("destructive op refuses by default; opt-in allows it", async () => {
    // Author drops the byEmail index.
    const v3Loosened = defineContract({
      family: idbFamilyPack,
      target: idbTargetPack,
      models: {
        User: { store: "users", key: "id", fields: { id: "String", email: "String" } },
        Post: { store: "posts", key: "id", fields: { id: "String", title: "String" } },
      },
    });

    const name = dbName();
    const space3 = buildContractSpaceFixture([v1, v2, v3]);
    const c3 = await createAutoMigratingIdbClient({ contractSpace: space3, dbName: name });
    await asRecord(c3.orm)["users"]!.create({ id: "u1", email: "alice@example.com" });
    await c3.close();

    const spaceLoose = buildContractSpaceFixture([v1, v2, v3, v3Loosened]);

    // Default policy refuses: dropping an index is destructive.
    await expect(createAutoMigratingIdbClient({ contractSpace: spaceLoose, dbName: name })).rejects.toThrow(/refused/i);

    // Opt-in lets it through.
    const cLoose = await createAutoMigratingIdbClient({
      contractSpace: spaceLoose,
      dbName: name,
      policy: { onDestructive: "allow" },
    });
    await asRecord(cLoose.orm)["users"]!.create({ id: "u2", email: "alice@example.com" });
    expect(await asRecord(cLoose.orm)["users"]!.all().toArray()).toHaveLength(2);
    await cLoose.close();
  });

  it("broken chain throws with a clear error", async () => {
    const name = dbName();
    // Bootstrap at v1.
    const space1 = buildContractSpaceFixture([v1]);
    const c1 = await createAutoMigratingIdbClient({ contractSpace: space1, dbName: name });
    await c1.close();

    // Build a space whose v1 hash has been replaced (chain doesn't connect
    // to the existing marker). Simulate by reusing v2 + v3 only — the
    // marker says "v1 hash" but the new space has no package whose
    // `from === v1 hash`.
    const broken = buildContractSpaceFixture([v2, v3]);
    await expect(createAutoMigratingIdbClient({ contractSpace: broken, dbName: name })).rejects.toThrow(
      /chain broken/i
    );
  });
});
