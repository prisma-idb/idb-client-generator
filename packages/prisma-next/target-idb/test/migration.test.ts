/**
 * Migration infrastructure tests.
 *
 * Coverage:
 * - diffIdbSchema: all four operation kinds, ordering, null-from (fresh DB)
 * - IdbMigrationPlanner.plan(): success path, empty-diff, null fromContract
 * - IdbMigrationPlanner.emptyMigration(): returns stub plan
 * - IdbMigrationPlanner.plan(): invalid contract returns failure
 * - IdbMigrationRunner.execute(): always returns IDB-RUNNER-CLI-UNSUPPORTED refusal
 * - IdbMigrationRunner.executeAcrossSpaces(): always returns IDB-RUNNER-CLI-UNSUPPORTED refusal
 * - openAndUpgrade: applies DDL to a real IDB via fake-indexeddb
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
import { IdbMigrationRunner, openAndUpgrade } from "../src/core/migration-runner";
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

  // ── Index-mutation detection (regression for Issue #15) ─────────────────────

  it("emits drop+create when an existing index's unique flag changes", () => {
    const from: IdbSchemaDiffInput = {
      stores: { users: { keyPath: "id", indexes: { byEmail: { keyPath: "email", unique: false } } } },
    };
    const to: IdbSchemaDiffInput = {
      stores: { users: { keyPath: "id", indexes: { byEmail: { keyPath: "email", unique: true } } } },
    };
    const ops = diffIdbSchema(from, to);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ kind: "dropIndex", storeName: "users", indexName: "byEmail" });
    expect(ops[1]).toMatchObject({
      kind: "createIndex",
      storeName: "users",
      indexName: "byEmail",
      def: expect.objectContaining({ unique: true }),
    });
  });

  it("emits drop+create when an existing index's keyPath changes", () => {
    const from: IdbSchemaDiffInput = {
      stores: { users: { keyPath: "id", indexes: { byName: { keyPath: "firstName", unique: false } } } },
    };
    const to: IdbSchemaDiffInput = {
      stores: { users: { keyPath: "id", indexes: { byName: { keyPath: "lastName", unique: false } } } },
    };
    const ops = diffIdbSchema(from, to);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ kind: "dropIndex", indexName: "byName" });
    expect(ops[1]).toMatchObject({
      kind: "createIndex",
      indexName: "byName",
      def: expect.objectContaining({ keyPath: "lastName" }),
    });
  });

  it("emits drop+create when multiEntry toggles", () => {
    const from: IdbSchemaDiffInput = {
      stores: {
        posts: {
          keyPath: "id",
          indexes: { byTags: { keyPath: "tags", unique: false, multiEntry: false } },
        },
      },
    };
    const to: IdbSchemaDiffInput = {
      stores: {
        posts: {
          keyPath: "id",
          indexes: { byTags: { keyPath: "tags", unique: false, multiEntry: true } },
        },
      },
    };
    const ops = diffIdbSchema(from, to);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ kind: "dropIndex", indexName: "byTags" });
    expect(ops[1]).toMatchObject({ kind: "createIndex", def: expect.objectContaining({ multiEntry: true }) });
  });

  it("treats undefined unique/multiEntry as equivalent to false (no spurious diff)", () => {
    const from: IdbSchemaDiffInput = {
      stores: { users: { keyPath: "id", indexes: { byEmail: { keyPath: "email", unique: false } } } },
    };
    const to: IdbSchemaDiffInput = {
      // `unique` omitted — equivalent to false after default-stripping
      stores: { users: { keyPath: "id", indexes: { byEmail: { keyPath: "email" } as never } } },
    };
    expect(diffIdbSchema(from, to)).toHaveLength(0);
  });

  it("throws when an existing store's keyPath changes", () => {
    const from: IdbSchemaDiffInput = { stores: { users: { keyPath: "id" } } };
    const to: IdbSchemaDiffInput = { stores: { users: { keyPath: "uuid" } } };
    expect(() => diffIdbSchema(from, to)).toThrow(/keyPath/);
  });

  it("throws when autoIncrement toggles on an existing store", () => {
    const from: IdbSchemaDiffInput = { stores: { users: { keyPath: "id", autoIncrement: false } } };
    const to: IdbSchemaDiffInput = { stores: { users: { keyPath: "id", autoIncrement: true } } };
    expect(() => diffIdbSchema(from, to)).toThrow(/autoIncrement/);
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

  it("renderTypeScript() emits a class-based scaffold with MigrationCLI shim", () => {
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
    expect(src).toContain("export default class M extends Migration");
    expect(src).toContain("override describe()");
    expect(src).toContain("override get operations()");
    expect(src).toContain("MigrationCLI.run(import.meta.url, M)");
    expect(src).toContain("createObjectStoreOp");
    expect(src).toContain("users");
    expect(src).toContain('to: "x"');
    expect(src).toContain("from: null");
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
    const src = plan.renderTypeScript();
    expect(src).toContain("export default class M extends Migration");
    expect(src).toContain("Add IDB DDL operations here");
    expect(src).toContain("MigrationCLI.run(import.meta.url, M)");
  });

  it("emptyMigration() threads fromHash into describe()", () => {
    const plan = planner.emptyMigration({ packageDir: "/tmp", fromHash: "sha256:prev", toHash: "sha256:next" }, "app");
    const src = plan.renderTypeScript();
    expect(src).toContain('from: "sha256:prev"');
    expect(src).toContain('to: "sha256:next"');
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

  it("execute() always returns IDB-RUNNER-CLI-UNSUPPORTED refusal", async () => {
    const result = await runner.execute({
      driver: makeDriver(dbName(), 1),
      perSpaceOptions: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("IDB-RUNNER-CLI-UNSUPPORTED");
  });
});

// ── openAndUpgrade (DDL apply) ────────────────────────────────────────────────

describe("openAndUpgrade", () => {
  it("creates a new object store in a fresh DB", async () => {
    const name = dbName();
    const ops = diffIdbSchema(null, { stores: { users: { keyPath: "id" } } });
    await openAndUpgrade({ factory: indexedDB, dbName: name, targetVersion: 1, ops });

    const db = await new Promise<IDBDatabase>((res, rej) => {
      const req = indexedDB.open(name);
      req.onsuccess = (e) => res((e.target as IDBOpenDBRequest).result);
      req.onerror = (e) => rej((e.target as IDBOpenDBRequest).error);
    });
    expect(db.objectStoreNames.contains("users")).toBe(true);
    db.close();
  });

  it("creates a store with an index", async () => {
    const name = dbName();
    const ops = diffIdbSchema(null, {
      stores: { posts: { keyPath: "id", indexes: { author_idx: { keyPath: "authorId", unique: false } } } },
    });
    await openAndUpgrade({ factory: indexedDB, dbName: name, targetVersion: 1, ops });

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

  it("applies ops incrementally across version bumps", async () => {
    const name = dbName();
    await openAndUpgrade({
      factory: indexedDB,
      dbName: name,
      targetVersion: 1,
      ops: diffIdbSchema(null, { stores: { old: { keyPath: "id" } } }),
    });
    await openAndUpgrade({
      factory: indexedDB,
      dbName: name,
      targetVersion: 2,
      ops: diffIdbSchema({ stores: { old: { keyPath: "id" } } }, { stores: {} }),
    });

    const db = await new Promise<IDBDatabase>((res, rej) => {
      const req = indexedDB.open(name);
      req.onsuccess = (e) => res((e.target as IDBOpenDBRequest).result);
      req.onerror = (e) => rej((e.target as IDBOpenDBRequest).error);
    });
    expect(db.objectStoreNames.contains("old")).toBe(false);
    db.close();
  });
});
