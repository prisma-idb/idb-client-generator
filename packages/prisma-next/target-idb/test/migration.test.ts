/**
 * Migration infrastructure tests.
 *
 * Coverage:
 * - diffIdbSchema: all four operation kinds, ordering, null-from (fresh DB)
 * - IdbMigrationPlanner.plan(): success path, empty-diff, null fromContract
 * - IdbMigrationPlanner.emptyMigration(): returns stub plan
 * - IdbMigrationPlanner.plan(): invalid contract returns failure
 * - IdbMigrationRunner.execute(): applies DDL to a real IDB via fake-indexeddb
 * - IdbMigrationRunner.execute(): policy filtering skips destructive ops
 * - IdbMigrationRunner.execute(): rejects unknown op kinds
 * - IdbMigrationControlDriverDescriptor: creates driver with correct fields
 * - extractMigrationDriver: throws on missing fields
 * - renderTypeScript: generates valid TS source for generated ops
 *
 * Isolation: fake-indexeddb/auto (vitest.config.ts) provides a global
 * `indexedDB` singleton. Tests use unique db names to avoid cross-test state.
 */

import { describe, expect, it } from "vitest";
import { diffIdbSchema } from "../src/core/schema-diff";
import { createIndexOp, createObjectStoreOp, dropIndexOp, dropObjectStoreOp } from "../src/core/migration-factories";
import { IdbMigrationPlanner, contractToIdbSchema } from "../src/core/migration-planner";
import { IdbMigrationRunner } from "../src/core/migration-runner";
import { IdbMigrationControlDriverDescriptor, extractMigrationDriver } from "../src/core/migration-driver";
import type { IdbSchemaDiffInput } from "../src/core/schema-diff";
import type { MigrationOperationPolicy } from "@prisma-next/framework-components/control";

// ── Helpers ───────────────────────────────────────────────────────────────────

let dbCounter = 0;
function dbName(): string {
  return `migration-test-${++dbCounter}`;
}

const ALLOW_ALL: MigrationOperationPolicy = {
  allowedOperationClasses: ["additive", "widening", "destructive", "data"],
};

const ALLOW_ADDITIVE: MigrationOperationPolicy = {
  allowedOperationClasses: ["additive"],
};

function makeDriver(name: string, version: number) {
  return IdbMigrationControlDriverDescriptor.create({
    dbName: name,
    factory: indexedDB,
    targetVersion: version,
  });
}

// ── diffIdbSchema ─────────────────────────────────────────────────────────────

describe("diffIdbSchema", () => {
  it("creates a new store with its indexes when migrating from null", () => {
    const to: IdbSchemaDiffInput = {
      stores: {
        users: {
          keyPath: "id",
          indexes: { email_idx: { keyPath: "email", unique: true } },
        },
      },
    };
    const ops = diffIdbSchema(null, to);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ kind: "createObjectStore", storeName: "users" });
    expect(ops[1]).toMatchObject({ kind: "createIndex", storeName: "users", indexName: "email_idx" });
  });

  it("adds a new index on an existing store", () => {
    const from: IdbSchemaDiffInput = { stores: { users: { keyPath: "id" } } };
    const to: IdbSchemaDiffInput = {
      stores: { users: { keyPath: "id", indexes: { name_idx: { keyPath: "name", unique: false } } } },
    };
    const ops = diffIdbSchema(from, to);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: "createIndex", storeName: "users", indexName: "name_idx" });
  });

  it("drops a removed index from a surviving store", () => {
    const from: IdbSchemaDiffInput = {
      stores: { users: { keyPath: "id", indexes: { old_idx: { keyPath: "old", unique: false } } } },
    };
    const to: IdbSchemaDiffInput = { stores: { users: { keyPath: "id" } } };
    const ops = diffIdbSchema(from, to);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: "dropIndex", storeName: "users", indexName: "old_idx" });
  });

  it("drops a removed store", () => {
    const from: IdbSchemaDiffInput = {
      stores: {
        users: { keyPath: "id" },
        sessions: { keyPath: "id" },
      },
    };
    const to: IdbSchemaDiffInput = { stores: { users: { keyPath: "id" } } };
    const ops = diffIdbSchema(from, to);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: "dropObjectStore", storeName: "sessions" });
  });

  it("produces no ops when schemas are identical", () => {
    const schema: IdbSchemaDiffInput = { stores: { users: { keyPath: "id" } } };
    expect(diffIdbSchema(schema, schema)).toHaveLength(0);
  });

  it("places creates before drops (ordering invariant)", () => {
    const from: IdbSchemaDiffInput = { stores: { old: { keyPath: "id" } } };
    const to: IdbSchemaDiffInput = { stores: { newStore: { keyPath: "id" } } };
    const ops = diffIdbSchema(from, to);
    // createObjectStore must come before dropObjectStore
    const createIdx = ops.findIndex((o) => o.kind === "createObjectStore");
    const dropIdx = ops.findIndex((o) => o.kind === "dropObjectStore");
    expect(createIdx).toBeGreaterThanOrEqual(0);
    expect(dropIdx).toBeGreaterThan(createIdx);
  });

  it("op ids and labels are stable and descriptive", () => {
    const ops = diffIdbSchema(null, { stores: { users: { keyPath: "id" } } });
    expect(ops[0]?.id).toBe("object-store.users.create");
    expect(ops[0]?.label).toContain("users");
    expect(ops[0]?.operationClass).toBe("additive");
  });
});

// ── migration-factories ───────────────────────────────────────────────────────

describe("migration-factories", () => {
  it("createObjectStoreOp sets id, label, operationClass", () => {
    const op = createObjectStoreOp("posts", { keyPath: "id" });
    expect(op.kind).toBe("createObjectStore");
    expect(op.id).toBe("object-store.posts.create");
    expect(op.operationClass).toBe("additive");
    expect(op.def.keyPath).toBe("id");
  });

  it("dropObjectStoreOp is destructive", () => {
    const op = dropObjectStoreOp("posts");
    expect(op.operationClass).toBe("destructive");
  });

  it("createIndexOp includes def fields", () => {
    const op = createIndexOp("users", "email_idx", { keyPath: "email", unique: true });
    expect(op.def.unique).toBe(true);
    expect(op.operationClass).toBe("additive");
  });

  it("dropIndexOp is destructive", () => {
    const op = dropIndexOp("users", "email_idx");
    expect(op.operationClass).toBe("destructive");
    expect(op.id).toBe("index.users.email_idx.drop");
  });
});

// ── IdbMigrationControlDriverDescriptor ──────────────────────────────────────

describe("IdbMigrationControlDriverDescriptor", () => {
  it("creates a driver with correct identity and fields", () => {
    const driver = makeDriver("test-db", 1);
    expect(driver.familyId).toBe("idb");
    expect(driver.targetId).toBe("idb");
    expect(driver.dbName).toBe("test-db");
    expect(driver.targetVersion).toBe(1);
  });

  it("query() returns empty rows (no-op stub)", async () => {
    const driver = makeDriver("test-db", 1);
    const result = await driver.query("unused");
    expect(result.rows).toHaveLength(0);
  });

  it("close() resolves without error", async () => {
    const driver = makeDriver("test-db", 1);
    await expect(driver.close()).resolves.toBeUndefined();
  });
});

// ── extractMigrationDriver ────────────────────────────────────────────────────

describe("extractMigrationDriver", () => {
  it("returns the driver unchanged when it has the required fields", () => {
    const driver = makeDriver("test-db", 1);
    expect(extractMigrationDriver(driver)).toBe(driver);
  });

  it("throws when the driver is missing dbName / factory / targetVersion", () => {
    const plain = {
      familyId: "idb" as const,
      targetId: "idb" as const,
      query: () => Promise.resolve({ rows: [] }),
      close: () => Promise.resolve(),
    };
    expect(() => extractMigrationDriver(plain)).toThrow();
  });
});

// ── IdbMigrationPlanner ───────────────────────────────────────────────────────

describe("IdbMigrationPlanner", () => {
  const planner = new IdbMigrationPlanner();

  it("plan(): returns success with correct ops for a fresh DB", () => {
    const contract = {
      storage: {
        storageHash: "abc123",
        stores: { users: { keyPath: "id" } },
      },
    };
    const result = planner.plan({
      contract,
      schema: null,
      policy: ALLOW_ALL,
      fromContract: null,
      frameworkComponents: [],
      spaceId: "app",
    });
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.plan.operations.length).toBeGreaterThanOrEqual(1);
    // The marker store op is always prepended; the user's store comes after.
    const userStoreOp = result.plan.operations.find(
      (op) => (op as unknown as Record<string, unknown>)["storeName"] === "users"
    );
    expect(userStoreOp).toBeDefined();
    expect((userStoreOp as unknown as Record<string, unknown>)["kind"]).toBe("createObjectStore");
    expect(result.plan.targetId).toBe("idb");
    expect(result.plan.destination.storageHash).toBe("abc123");
    expect(result.plan.origin).toBeNull();
  });

  it("plan(): sets origin.storageHash from fromContract", () => {
    const from = { storage: { storageHash: "old-hash", stores: { users: { keyPath: "id" } } } };
    const to = { storage: { storageHash: "new-hash", stores: { users: { keyPath: "id" }, posts: { keyPath: "id" } } } };
    const result = planner.plan({
      contract: to,
      schema: null,
      policy: ALLOW_ALL,
      fromContract: from as never,
      frameworkComponents: [],
      spaceId: "app",
    });
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.plan.origin).toMatchObject({ storageHash: "old-hash" });
  });

  it("plan(): returns empty ops when schemas are identical", () => {
    const contract = { storage: { storageHash: "x", stores: { users: { keyPath: "id" } } } };
    const result = planner.plan({
      contract,
      schema: null,
      policy: ALLOW_ALL,
      fromContract: contract as never,
      frameworkComponents: [],
      spaceId: "app",
    });
    expect(result.kind).toBe("success");
    if (result.kind !== "success") return;
    expect(result.plan.operations).toHaveLength(0);
  });

  it("plan(): returns failure for invalid contract", () => {
    const result = planner.plan({
      contract: null,
      schema: null,
      policy: ALLOW_ALL,
      fromContract: null,
      frameworkComponents: [],
      spaceId: "app",
    });
    expect(result.kind).toBe("failure");
  });

  it("renderTypeScript() returns non-empty source for a plan with ops", () => {
    const contract = { storage: { storageHash: "x", stores: { users: { keyPath: "id" } } } };
    const result = planner.plan({
      contract,
      schema: null,
      policy: ALLOW_ALL,
      fromContract: null,
      frameworkComponents: [],
      spaceId: "app",
    });
    if (result.kind !== "success") throw new Error("expected success");
    const src = result.plan.renderTypeScript();
    expect(src).toContain("createObjectStoreOp");
    expect(src).toContain("users");
  });

  it("renderTypeScript() defaults missing unique to false (regression)", () => {
    // The contract canonicaliser may strip `unique: false` from indexes
    // (default-stripping). Previously the renderer wrote `unique: undefined`,
    // which is sloppy output and a type error under exactOptionalPropertyTypes.
    const contract = {
      storage: {
        storageHash: "x",
        stores: {
          posts: {
            keyPath: "id",
            // No `unique` field — exercises the default path.
            indexes: { byAuthorId: { keyPath: "authorId" } },
          },
        },
      },
    };
    const result = planner.plan({
      contract,
      schema: null,
      policy: ALLOW_ALL,
      fromContract: null,
      frameworkComponents: [],
      spaceId: "app",
    });
    if (result.kind !== "success") throw new Error("expected success");
    const src = result.plan.renderTypeScript();
    expect(src).toContain("unique: false");
    expect(src).not.toContain("unique: undefined");
  });

  it("emptyMigration() returns a stub plan with no ops", () => {
    const plan = planner.emptyMigration({ packageDir: "/tmp", fromHash: null, toHash: "x" }, "app");
    expect(plan.operations).toHaveLength(0);
    expect(plan.renderTypeScript()).toContain("IdbMigration");
  });
});

// ── contractToIdbSchema ───────────────────────────────────────────────────────

describe("contractToIdbSchema", () => {
  it("returns null for null input", () => {
    expect(contractToIdbSchema(null)).toBeNull();
  });

  it("extracts stores from a valid contract-shaped object", () => {
    const contract = { storage: { storageHash: "x", stores: { users: { keyPath: "id" } } } };
    const schema = contractToIdbSchema(contract);
    expect(schema).not.toBeNull();
    expect(schema?.stores["users"]?.keyPath).toBe("id");
  });

  it("returns null for object missing storage.stores", () => {
    expect(contractToIdbSchema({ storage: {} })).toBeNull();
    expect(contractToIdbSchema({ other: true })).toBeNull();
  });
});

// ── IdbMigrationRunner ────────────────────────────────────────────────────────

describe("IdbMigrationRunner", () => {
  const runner = new IdbMigrationRunner();

  it("creates a new object store in a fresh DB", async () => {
    const name = dbName();
    const driver = makeDriver(name, 1);
    const ops = diffIdbSchema(null, { stores: { users: { keyPath: "id" } } });
    const plan = {
      targetId: "idb",
      origin: null,
      destination: { storageHash: "x" },
      operations: ops,
    };
    const result = await runner.execute({
      plan,
      driver,
      destinationContract: null,
      policy: ALLOW_ALL,
      frameworkComponents: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.operationsExecuted).toBe(1);

    // Verify the store was actually created
    const openReq = indexedDB.open(name);
    const db = await new Promise<IDBDatabase>((res, rej) => {
      openReq.onsuccess = (e) => res((e.target as IDBOpenDBRequest).result);
      openReq.onerror = (e) => rej((e.target as IDBOpenDBRequest).error);
    });
    expect(db.objectStoreNames.contains("users")).toBe(true);
    db.close();
  });

  it("creates a store with an index", async () => {
    const name = dbName();
    const driver = makeDriver(name, 1);
    const ops = diffIdbSchema(null, {
      stores: { posts: { keyPath: "id", indexes: { author_idx: { keyPath: "authorId", unique: false } } } },
    });
    await runner.execute({
      plan: { targetId: "idb", origin: null, destination: { storageHash: "x" }, operations: ops },
      driver,
      destinationContract: null,
      policy: ALLOW_ALL,
      frameworkComponents: [],
    });

    const db = await new Promise<IDBDatabase>((res, rej) => {
      const req = indexedDB.open(name);
      req.onsuccess = (e) => res((e.target as IDBOpenDBRequest).result);
      req.onerror = (e) => rej((e.target as IDBOpenDBRequest).error);
    });
    const tx = db.transaction("posts", "readonly");
    const store = tx.objectStore("posts");
    expect(store.indexNames.contains("author_idx")).toBe(true);
    db.close();
  });

  it("policy filtering: skips destructive ops with additive-only policy", async () => {
    const name = dbName();
    // First create the store
    const driver1 = makeDriver(name, 1);
    await runner.execute({
      plan: {
        targetId: "idb",
        origin: null,
        destination: { storageHash: "x" },
        operations: diffIdbSchema(null, { stores: { old: { keyPath: "id" } } }),
      },
      driver: driver1,
      destinationContract: null,
      policy: ALLOW_ALL,
      frameworkComponents: [],
    });

    // Now try to drop it with additive-only policy
    const driver2 = makeDriver(name, 2);
    const dropOps = diffIdbSchema({ stores: { old: { keyPath: "id" } } }, { stores: {} });
    const result = await runner.execute({
      plan: { targetId: "idb", origin: null, destination: { storageHash: "y" }, operations: dropOps },
      driver: driver2,
      destinationContract: null,
      policy: ALLOW_ADDITIVE,
      frameworkComponents: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 1 op planned, 0 executed (destructive was filtered)
    expect(result.value.operationsPlanned).toBe(1);
    expect(result.value.operationsExecuted).toBe(0);
  });

  it("returns ok with 0 executed for an empty plan", async () => {
    const driver = makeDriver(dbName(), 1);
    const result = await runner.execute({
      plan: { targetId: "idb", origin: null, destination: { storageHash: "x" }, operations: [] },
      driver,
      destinationContract: null,
      policy: ALLOW_ALL,
      frameworkComponents: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.operationsExecuted).toBe(0);
  });

  it("returns NotOk for an op with unrecognised kind", async () => {
    const driver = makeDriver(dbName(), 1);
    const badOp = { id: "x", label: "x", operationClass: "additive" as const };
    const result = await runner.execute({
      plan: { targetId: "idb", origin: null, destination: { storageHash: "x" }, operations: [badOp] },
      driver,
      destinationContract: null,
      policy: ALLOW_ALL,
      frameworkComponents: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("IDB-RUNNER-001");
  });

  it("assertOk() on Ok returns the value", async () => {
    const driver = makeDriver(dbName(), 1);
    const result = await runner.execute({
      plan: { targetId: "idb", origin: null, destination: { storageHash: "x" }, operations: [] },
      driver,
      destinationContract: null,
      policy: ALLOW_ALL,
      frameworkComponents: [],
    });
    const value = result.assertOk();
    expect(value.operationsExecuted).toBe(0);
  });
});
