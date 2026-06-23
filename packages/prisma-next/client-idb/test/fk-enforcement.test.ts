/**
 * Phase 6.8 — FK referential action enforcement on delete.
 *
 * Covers:
 *   restrict (default) — throws when children exist; succeeds when none
 *   cascade           — deletes children in the same transaction
 *   setNull           — nulls child FK fields in the same transaction
 *   noAction          — deletes parent, leaves children untouched
 *   setDefault        — throws (unsupported)
 *   deleteAll cascade — cascade propagates for every deleted parent
 *   deleteCount       — inherits enforcement from deleteAll
 */
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AsyncIterableResult } from "@prisma-next/framework-components/runtime";
import { defineContract } from "@prisma-next-idb/family-idb/contract-ts";
import idbFamilyPack from "@prisma-next-idb/family-idb/pack";
import idbTargetPack from "@prisma-next-idb/target-idb/pack";
import { createIDBRuntimeDriver, type IdbRuntimeDriverInstance } from "@prisma-next-idb/driver-idb/runtime";
import type { IdbQueryPlan } from "@prisma-next-idb/adapter-idb/runtime";
import { idbOrm } from "../src/exports/orm";
import type { IdbQueryExecutor, IdbQueryExecutorWithTransaction } from "../src/exports/orm";

// ── Test executor ─────────────────────────────────────────────────────────────

class TestExecutorWithTransaction implements IdbQueryExecutor, IdbQueryExecutorWithTransaction {
  readonly #driver: IdbRuntimeDriverInstance;
  constructor(driver: IdbRuntimeDriverInstance) {
    this.#driver = driver;
  }
  execute<Row>(plan: IdbQueryPlan<Row>): AsyncIterableResult<Row> {
    const it = this.#driver.execute(plan.idbPlan);
    return new AsyncIterableResult(
      (async function* () {
        for await (const row of it) yield row as Row;
      })()
    );
  }
  transaction(storeNames: string[], mode?: IDBTransactionMode) {
    return this.#driver.transaction(storeNames, mode);
  }
}

// ── DB helpers ────────────────────────────────────────────────────────────────

let dbCounter = 0;
function nextDbName(): string {
  return `fk-enforcement-test-${++dbCounter}`;
}

function openTestDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("users", { keyPath: "id" });
      db.createObjectStore("posts", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllRows(db: IDBDatabase, storeName: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result as Record<string, unknown>[]);
    req.onerror = () => reject(req.error);
  });
}

// ── restrict (default) ────────────────────────────────────────────────────────

const restrictContract = defineContract({
  family: idbFamilyPack,
  target: idbTargetPack,
  models: {
    User: {
      store: "users",
      key: "id",
      fields: { id: "String", name: "String" },
      relations: {
        posts: { to: "Post", cardinality: "1:N", on: { local: ["id"], target: ["authorId"] } },
        // no onDelete → defaults to restrict
      },
    },
    Post: {
      store: "posts",
      key: "id",
      fields: { id: "String", authorId: "String", title: "String" },
    },
  },
});

describe("delete — restrict (default)", () => {
  let db: IDBDatabase;
  let executor: TestExecutorWithTransaction;

  beforeEach(async () => {
    const name = nextDbName();
    db = await openTestDb(name);
    executor = new TestExecutorWithTransaction(createIDBRuntimeDriver(name).create());
  });
  afterEach(() => db.close());

  it("throws when child records exist", async () => {
    const orm = idbOrm({ contract: restrictContract, executor });
    await orm["users"]!.create({ id: "u1", name: "Alice" } as never);
    await orm["posts"]!.create({ id: "p1", title: "Post", authorId: "u1" } as never);
    await expect(orm["users"]!.delete("u1" as never)).rejects.toThrow(/Cannot delete User.*child records.*posts/i);
    // Parent and child must both still exist (transaction rolled back).
    expect(await getAllRows(db, "users")).toHaveLength(1);
    expect(await getAllRows(db, "posts")).toHaveLength(1);
  });

  it("succeeds when no child records exist", async () => {
    const orm = idbOrm({ contract: restrictContract, executor });
    await orm["users"]!.create({ id: "u1", name: "Alice" } as never);
    await orm["users"]!.delete("u1" as never);
    expect(await getAllRows(db, "users")).toHaveLength(0);
  });
});

// ── cascade ───────────────────────────────────────────────────────────────────

const cascadeContract = defineContract({
  family: idbFamilyPack,
  target: idbTargetPack,
  models: {
    User: {
      store: "users",
      key: "id",
      fields: { id: "String", name: "String" },
      relations: {
        posts: { to: "Post", cardinality: "1:N", on: { local: ["id"], target: ["authorId"] }, onDelete: "cascade" },
      },
    },
    Post: {
      store: "posts",
      key: "id",
      fields: { id: "String", authorId: "String", title: "String" },
    },
  },
});

const fkSideCascadeContract = defineContract({
  family: idbFamilyPack,
  target: idbTargetPack,
  models: {
    User: {
      store: "users",
      key: "id",
      fields: { id: "String", name: "String" },
      relations: {
        posts: { to: "Post", cardinality: "1:N", on: { local: ["id"], target: ["authorId"] } },
      },
    },
    Post: {
      store: "posts",
      key: "id",
      fields: { id: "String", authorId: "String", title: "String" },
      relations: {
        author: {
          to: "User",
          cardinality: "N:1",
          on: { local: ["authorId"], target: ["id"] },
          onDelete: "cascade",
        },
      },
    },
  },
});

describe("delete — cascade", () => {
  let db: IDBDatabase;
  let executor: TestExecutorWithTransaction;

  beforeEach(async () => {
    const name = nextDbName();
    db = await openTestDb(name);
    executor = new TestExecutorWithTransaction(createIDBRuntimeDriver(name).create());
  });
  afterEach(() => db.close());

  it("deletes parent and all children in the same transaction", async () => {
    const orm = idbOrm({ contract: cascadeContract, executor });
    await orm["users"]!.create({ id: "u1", name: "Alice" } as never);
    await orm["posts"]!.create({ id: "p1", title: "Post 1", authorId: "u1" } as never);
    await orm["posts"]!.create({ id: "p2", title: "Post 2", authorId: "u1" } as never);
    await orm["users"]!.delete("u1" as never);
    expect(await getAllRows(db, "users")).toHaveLength(0);
    expect(await getAllRows(db, "posts")).toHaveLength(0);
  });

  it("only deletes children belonging to the deleted parent", async () => {
    const orm = idbOrm({ contract: cascadeContract, executor });
    await orm["users"]!.create({ id: "u1", name: "Alice" } as never);
    await orm["users"]!.create({ id: "u2", name: "Bob" } as never);
    await orm["posts"]!.create({ id: "p1", title: "Alice post", authorId: "u1" } as never);
    await orm["posts"]!.create({ id: "p2", title: "Bob post", authorId: "u2" } as never);
    await orm["users"]!.delete("u1" as never);
    expect(await getAllRows(db, "users")).toHaveLength(1);
    const posts = await getAllRows(db, "posts");
    expect(posts).toHaveLength(1);
    expect(posts[0]?.["id"]).toBe("p2");
  });

  it("delete of nonexistent key is a no-op", async () => {
    const orm = idbOrm({ contract: cascadeContract, executor });
    await orm["users"]!.delete("ghost" as never);
    expect(await getAllRows(db, "users")).toHaveLength(0);
  });

  it("honors onDelete stored on the FK-side relation", async () => {
    const orm = idbOrm({ contract: fkSideCascadeContract, executor });
    await orm["users"]!.create({ id: "u1", name: "Alice" } as never);
    await orm["posts"]!.create({ id: "p1", title: "Post", authorId: "u1" } as never);

    await orm["users"]!.delete("u1" as never);

    expect(await getAllRows(db, "users")).toHaveLength(0);
    expect(await getAllRows(db, "posts")).toHaveLength(0);
  });
});

// ── setNull ───────────────────────────────────────────────────────────────────

const setNullContract = defineContract({
  family: idbFamilyPack,
  target: idbTargetPack,
  models: {
    User: {
      store: "users",
      key: "id",
      fields: { id: "String", name: "String" },
      relations: {
        posts: { to: "Post", cardinality: "1:N", on: { local: ["id"], target: ["authorId"] }, onDelete: "setNull" },
      },
    },
    Post: {
      store: "posts",
      key: "id",
      fields: { id: "String", authorId: "String?", title: "String" },
    },
  },
});

describe("delete — setNull", () => {
  let db: IDBDatabase;
  let executor: TestExecutorWithTransaction;

  beforeEach(async () => {
    const name = nextDbName();
    db = await openTestDb(name);
    executor = new TestExecutorWithTransaction(createIDBRuntimeDriver(name).create());
  });
  afterEach(() => db.close());

  it("nulls FK on children and deletes parent", async () => {
    const orm = idbOrm({ contract: setNullContract, executor });
    await orm["users"]!.create({ id: "u1", name: "Alice" } as never);
    await orm["posts"]!.create({ id: "p1", title: "Post", authorId: "u1" } as never);
    await orm["users"]!.delete("u1" as never);
    expect(await getAllRows(db, "users")).toHaveLength(0);
    const posts = await getAllRows(db, "posts");
    expect(posts).toHaveLength(1);
    expect(posts[0]?.["authorId"]).toBeNull();
  });
});

// ── noAction ──────────────────────────────────────────────────────────────────

const noActionContract = defineContract({
  family: idbFamilyPack,
  target: idbTargetPack,
  models: {
    User: {
      store: "users",
      key: "id",
      fields: { id: "String", name: "String" },
      relations: {
        posts: { to: "Post", cardinality: "1:N", on: { local: ["id"], target: ["authorId"] }, onDelete: "noAction" },
      },
    },
    Post: {
      store: "posts",
      key: "id",
      fields: { id: "String", authorId: "String", title: "String" },
    },
  },
});

describe("delete — noAction", () => {
  let db: IDBDatabase;
  let executor: TestExecutorWithTransaction;

  beforeEach(async () => {
    const name = nextDbName();
    db = await openTestDb(name);
    executor = new TestExecutorWithTransaction(createIDBRuntimeDriver(name).create());
  });
  afterEach(() => db.close());

  it("deletes parent and leaves children with dangling FK", async () => {
    const orm = idbOrm({ contract: noActionContract, executor });
    await orm["users"]!.create({ id: "u1", name: "Alice" } as never);
    await orm["posts"]!.create({ id: "p1", title: "Post", authorId: "u1" } as never);
    await orm["users"]!.delete("u1" as never);
    expect(await getAllRows(db, "users")).toHaveLength(0);
    // Posts still exist with the now-dangling authorId.
    const posts = await getAllRows(db, "posts");
    expect(posts).toHaveLength(1);
    expect(posts[0]?.["authorId"]).toBe("u1");
  });
});

// ── setDefault (unsupported) ──────────────────────────────────────────────────

const setDefaultContract = defineContract({
  family: idbFamilyPack,
  target: idbTargetPack,
  models: {
    User: {
      store: "users",
      key: "id",
      fields: { id: "String", name: "String" },
      relations: {
        posts: {
          to: "Post",
          cardinality: "1:N",
          on: { local: ["id"], target: ["authorId"] },
          onDelete: "setDefault",
        },
      },
    },
    Post: {
      store: "posts",
      key: "id",
      fields: { id: "String", authorId: "String", title: "String" },
    },
  },
});

describe("delete — setDefault (unsupported)", () => {
  let db: IDBDatabase;
  let executor: TestExecutorWithTransaction;

  beforeEach(async () => {
    const name = nextDbName();
    db = await openTestDb(name);
    executor = new TestExecutorWithTransaction(createIDBRuntimeDriver(name).create());
  });
  afterEach(() => db.close());

  it("throws an unsupported error at runtime", async () => {
    const orm = idbOrm({ contract: setDefaultContract, executor });
    await orm["users"]!.create({ id: "u1", name: "Alice" } as never);
    await orm["posts"]!.create({ id: "p1", title: "Post", authorId: "u1" } as never);
    await expect(orm["users"]!.delete("u1" as never)).rejects.toThrow(/setDefault.*not supported/i);
  });
});

// ── deleteAll with cascade ────────────────────────────────────────────────────

describe("deleteAll — cascade", () => {
  let db: IDBDatabase;
  let executor: TestExecutorWithTransaction;

  beforeEach(async () => {
    const name = nextDbName();
    db = await openTestDb(name);
    executor = new TestExecutorWithTransaction(createIDBRuntimeDriver(name).create());
  });
  afterEach(() => db.close());

  it("cascade-deletes children for every deleted parent", async () => {
    const orm = idbOrm({ contract: cascadeContract, executor });
    await orm["users"]!.create({ id: "u1", name: "Alice" } as never);
    await orm["users"]!.create({ id: "u2", name: "Bob" } as never);
    await orm["posts"]!.create({ id: "p1", title: "A post", authorId: "u1" } as never);
    await orm["posts"]!.create({ id: "p2", title: "B post", authorId: "u2" } as never);
    const deleted = await orm["users"]!.deleteAll().toArray();
    expect(deleted).toHaveLength(2);
    expect(await getAllRows(db, "users")).toHaveLength(0);
    expect(await getAllRows(db, "posts")).toHaveLength(0);
  });

  it("deleteAll with a where filter only deletes matching parents and their children", async () => {
    const orm = idbOrm({ contract: cascadeContract, executor });
    await orm["users"]!.create({ id: "u1", name: "Alice" } as never);
    await orm["users"]!.create({ id: "u2", name: "Bob" } as never);
    await orm["posts"]!.create({ id: "p1", title: "A post", authorId: "u1" } as never);
    await orm["posts"]!.create({ id: "p2", title: "B post", authorId: "u2" } as never);
    await orm["users"]!.where({ id: "u1" } as never)
      .deleteAll()
      .toArray();
    expect(await getAllRows(db, "users")).toHaveLength(1);
    const posts = await getAllRows(db, "posts");
    expect(posts).toHaveLength(1);
    expect(posts[0]?.["id"]).toBe("p2");
  });
});

// ── deleteCount with cascade ──────────────────────────────────────────────────

describe("deleteCount — cascade", () => {
  let db: IDBDatabase;
  let executor: TestExecutorWithTransaction;

  beforeEach(async () => {
    const name = nextDbName();
    db = await openTestDb(name);
    executor = new TestExecutorWithTransaction(createIDBRuntimeDriver(name).create());
  });
  afterEach(() => db.close());

  it("returns the count of deleted parents and cascades children", async () => {
    const orm = idbOrm({ contract: cascadeContract, executor });
    await orm["users"]!.create({ id: "u1", name: "Alice" } as never);
    await orm["users"]!.create({ id: "u2", name: "Bob" } as never);
    await orm["posts"]!.create({ id: "p1", title: "Post", authorId: "u1" } as never);
    const count = await orm["users"]!.deleteCount();
    expect(count).toBe(2);
    expect(await getAllRows(db, "posts")).toHaveLength(0);
  });
});
