/**
 * Client IDB ORM tests.
 *
 * Uses fake-indexeddb (injected globally by vitest.config.ts setupFiles) and a
 * minimal in-process executor that wraps IdbRuntimeDriverInstance.execute()
 * inside AsyncIterableResult so it satisfies IdbQueryExecutor without needing
 * the full runtime stack.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AsyncIterableResult } from "@prisma-next/framework-components/runtime";
import { createContract } from "@prisma-next/contract/testing";
import type { IdbStorage } from "@prisma-next-idb/target-idb/pack";
import { createIDBRuntimeDriver } from "@prisma-next-idb/driver-idb/runtime";
import type { IdbRuntimeDriverInstance } from "@prisma-next-idb/driver-idb/runtime";
import type { IdbQueryPlan } from "@prisma-next-idb/adapter-idb/runtime";
import { idbOrm } from "../src/exports/orm";
import type { IdbQueryExecutor, IdbStoreAccessor } from "../src/exports/orm";

// ── Test-only cast helper ─────────────────────────────────────────────────────

/**
 * Cast the ORM client to a plain record so tests can access properties via
 * bracket notation without TS complaining about index signatures on mapped types.
 */
function asRecord(client: unknown): Record<string, IdbStoreAccessor<never, never>> {
  return client as Record<string, IdbStoreAccessor<never, never>>;
}

// ── Test executor ─────────────────────────────────────────────────────────────

/**
 * Wraps an IdbRuntimeDriverInstance so it satisfies IdbQueryExecutor.
 * The adapter is a passthrough (idbPlan ≡ planBody), so we extract idbPlan
 * directly instead of going through the full runtime stack.
 */
class TestExecutor implements IdbQueryExecutor {
  readonly #driver: IdbRuntimeDriverInstance;

  constructor(driver: IdbRuntimeDriverInstance) {
    this.#driver = driver;
  }

  execute<Row>(plan: IdbQueryPlan<Row>): AsyncIterableResult<Row> {
    const iterable = this.#driver.execute(plan.idbPlan);
    return new AsyncIterableResult(
      (async function* () {
        for await (const row of iterable) {
          yield row as Row;
        }
      })()
    );
  }
}

// ── Test helpers ──────────────────────────────────────────────────────────────

let dbCounter = 0;
function dbName(): string {
  return `client-idb-orm-test-${++dbCounter}`;
}

type StoreIndex = { name: string; keyPath: string; unique?: boolean };
type StoreSpec = { name: string; keyPath: string; indexes?: StoreIndex[] };

function openTestDb(name: string, stores: StoreSpec[]): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const storeSpec of stores) {
        const os = db.createObjectStore(storeSpec.name, { keyPath: storeSpec.keyPath });
        for (const idx of storeSpec.indexes ?? []) {
          os.createIndex(idx.name, idx.keyPath, { unique: idx.unique ?? false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function seedStore(db: IDBDatabase, storeName: string, records: Record<string, unknown>[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([storeName], "readwrite");
    const store = tx.objectStore(storeName);
    for (const record of records) store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Test contract ─────────────────────────────────────────────────────────────

function makeTestContract(
  roots: Record<string, string>,
  models: Record<
    string,
    {
      storeName: string;
      keyPath: string;
      relations?: Record<
        string,
        { to: string; cardinality: "1:1" | "1:N" | "N:1"; on: { localFields: string[]; targetFields: string[] } }
      >;
    }
  >
) {
  const contractModels: Record<
    string,
    { storage: { storeName: string; keyPath: string }; relations: Record<string, never>; fields: Record<string, never> }
  > = {};
  for (const [name, spec] of Object.entries(models)) {
    contractModels[name] = {
      storage: { storeName: spec.storeName, keyPath: spec.keyPath },
      relations: (spec.relations ?? {}) as Record<string, never>,
      fields: {},
    };
  }
  return {
    ...createContract<IdbStorage>({
      target: "idb",
      targetFamily: "idb",
      storage: { stores: {} },
      models: contractModels,
    }),
    roots,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const USERS_STORE: StoreSpec = { name: "users", keyPath: "id" };
const POSTS_STORE: StoreSpec = {
  name: "posts",
  keyPath: "id",
  indexes: [{ name: "byAuthorId", keyPath: "authorId" }],
};

const ALICE = { id: "u1", name: "Alice", email: "alice@example.com" };
const BOB = { id: "u2", name: "Bob", email: "bob@example.com" };
const POST_A = { id: "p1", title: "Hello", authorId: "u1" };
const POST_B = { id: "p2", title: "World", authorId: "u1" };
const POST_C = { id: "p3", title: "Other", authorId: "u2" };

describe("idbOrm factory", () => {
  it("returns a client with keys from contract.roots", () => {
    const contract = makeTestContract({ users: "User" }, { User: { storeName: "users", keyPath: "id" } });
    const driver = createIDBRuntimeDriver("no-db", 1).create();
    const client = idbOrm({ contract, executor: new TestExecutor(driver) });
    expect(client).toHaveProperty("users");
  });

  it("exposes all root keys from the contract", () => {
    const contract = makeTestContract(
      { users: "User", posts: "Post" },
      {
        User: { storeName: "users", keyPath: "id" },
        Post: { storeName: "posts", keyPath: "id" },
      }
    );
    const driver = createIDBRuntimeDriver("no-db", 1).create();
    const client = idbOrm({ contract, executor: new TestExecutor(driver) });
    expect(client).toHaveProperty("users");
    expect(client).toHaveProperty("posts");
  });
});

describe("IdbStoreAccessor — create / read", () => {
  let driver: IdbRuntimeDriverInstance;
  let executor: TestExecutor;

  beforeEach(async () => {
    const name = dbName();
    const setupDb = await openTestDb(name, [USERS_STORE]);
    // Close setup db; driver will re-open at version 1 (no upgrade needed)
    setupDb.close();
    driver = createIDBRuntimeDriver(name, 1).create();
    executor = new TestExecutor(driver);
  });

  afterEach(async () => {
    await driver.close();
  });

  function makeClient() {
    const contract = makeTestContract({ users: "User" }, { User: { storeName: "users", keyPath: "id" } });
    return asRecord(idbOrm({ contract, executor }));
  }

  it("create() inserts a record and returns it", async () => {
    const client = makeClient();
    const result = await client["users"]!.create({ id: "u1", name: "Alice", email: "alice@example.com" });
    expect(result).toMatchObject({ id: "u1", name: "Alice" });
  });

  it("all() returns all records", async () => {
    const name = dbName();
    const setupDb = await openTestDb(name, [USERS_STORE]);
    await seedStore(setupDb, "users", [ALICE, BOB]);
    setupDb.close();

    const d = createIDBRuntimeDriver(name, 1).create();
    const e = new TestExecutor(d);
    const contract = makeTestContract({ users: "User" }, { User: { storeName: "users", keyPath: "id" } });
    const client = asRecord(idbOrm({ contract, executor: e }));

    const rows = await client["users"]!.all().toArray();
    expect(rows).toHaveLength(2);
    await d.close();
  });

  it("all() returns empty array when store is empty", async () => {
    const client = makeClient();
    const rows = await client["users"]!.all().toArray();
    expect(rows).toHaveLength(0);
  });
});

describe("IdbStoreAccessor — where / take / skip / orderBy", () => {
  let driver: IdbRuntimeDriverInstance;
  let executor: TestExecutor;

  beforeEach(async () => {
    const name = dbName();
    const setupDb = await openTestDb(name, [USERS_STORE]);
    await seedStore(setupDb, "users", [ALICE, BOB]);
    setupDb.close();
    driver = createIDBRuntimeDriver(name, 1).create();
    executor = new TestExecutor(driver);
  });

  afterEach(async () => {
    await driver.close();
  });

  function makeClient() {
    const contract = makeTestContract({ users: "User" }, { User: { storeName: "users", keyPath: "id" } });
    return asRecord(idbOrm({ contract, executor }));
  }

  it("where() filters rows by field", async () => {
    const client = makeClient();
    const rows = await client["users"]!.where({ name: "Alice" }).all().toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Alice" });
  });

  it("where() with no match returns empty", async () => {
    const client = makeClient();
    const rows = await client["users"]!.where({ name: "Nobody" }).all().toArray();
    expect(rows).toHaveLength(0);
  });

  it("take() limits result count", async () => {
    const client = makeClient();
    const rows = await client["users"]!.take(1).all().toArray();
    expect(rows).toHaveLength(1);
  });

  it("skip() skips records", async () => {
    const client = makeClient();
    const rows = await client["users"]!.skip(1).all().toArray();
    expect(rows).toHaveLength(1);
  });

  it("orderBy() sorts ascending", async () => {
    const client = makeClient();
    const rows = await client["users"]!.orderBy({ name: "asc" }).all().toArray();
    const names = rows.map((r) => (r as Record<string, unknown>)["name"]);
    expect(names).toEqual(["Alice", "Bob"]);
  });

  it("orderBy() sorts descending", async () => {
    const client = makeClient();
    const rows = await client["users"]!.orderBy({ name: "desc" }).all().toArray();
    const names = rows.map((r) => (r as Record<string, unknown>)["name"]);
    expect(names).toEqual(["Bob", "Alice"]);
  });

  it("first() returns first match", async () => {
    const client = makeClient();
    const row = await client["users"]!.first();
    expect(row).not.toBeNull();
  });

  it("first() returns null when no match", async () => {
    const client = makeClient();
    const row = await client["users"]!.where({ name: "Nobody" }).first();
    expect(row).toBeNull();
  });
});

describe("IdbStoreAccessor — findUnique / delete", () => {
  let driver: IdbRuntimeDriverInstance;
  let executor: TestExecutor;
  let name: string;

  beforeEach(async () => {
    name = dbName();
    const setupDb = await openTestDb(name, [USERS_STORE]);
    await seedStore(setupDb, "users", [ALICE, BOB]);
    setupDb.close();
    driver = createIDBRuntimeDriver(name, 1).create();
    executor = new TestExecutor(driver);
  });

  afterEach(async () => {
    await driver.close();
  });

  function makeClient() {
    const contract = makeTestContract({ users: "User" }, { User: { storeName: "users", keyPath: "id" } });
    return asRecord(idbOrm({ contract, executor }));
  }

  it("findUnique() returns matching row by key", async () => {
    const client = makeClient();
    const row = await client["users"]!.findUnique("u1");
    expect(row).toMatchObject({ id: "u1", name: "Alice" });
  });

  it("findUnique() returns null for missing key", async () => {
    const client = makeClient();
    const row = await client["users"]!.findUnique("nonexistent");
    expect(row).toBeNull();
  });

  it("delete() removes a record", async () => {
    const client = makeClient();
    await client["users"]!.delete("u1");
    const row = await client["users"]!.findUnique("u1");
    expect(row).toBeNull();
  });

  it("delete() is a no-op for nonexistent key", async () => {
    const client = makeClient();
    // Should not throw
    await expect(client["users"]!.delete("nonexistent")).resolves.toBeUndefined();
  });
});

describe("IdbStoreAccessor — include (relations)", () => {
  let driver: IdbRuntimeDriverInstance;
  let executor: TestExecutor;

  beforeEach(async () => {
    const name = dbName();
    const setupDb = await openTestDb(name, [USERS_STORE, POSTS_STORE]);
    await seedStore(setupDb, "users", [ALICE, BOB]);
    await seedStore(setupDb, "posts", [POST_A, POST_B, POST_C]);
    setupDb.close();
    driver = createIDBRuntimeDriver(name, 1).create();
    executor = new TestExecutor(driver);
  });

  afterEach(async () => {
    await driver.close();
  });

  it("include() loads a 1:N relation", async () => {
    const contract = makeTestContract(
      { users: "User" },
      {
        User: {
          storeName: "users",
          keyPath: "id",
          relations: {
            posts: {
              to: "Post",
              cardinality: "1:N",
              on: { localFields: ["id"], targetFields: ["authorId"] },
            },
          },
        },
        Post: {
          storeName: "posts",
          keyPath: "id",
        },
      }
    );
    const client = asRecord(idbOrm({ contract, executor }));
    const rows = await client["users"]!.include("posts").all().toArray();
    const alice = rows.find((r) => (r as Record<string, unknown>)["id"] === "u1");
    expect(alice).toBeDefined();
    const posts = (alice as Record<string, unknown>)["posts"];
    expect(Array.isArray(posts)).toBe(true);
    expect((posts as unknown[]).length).toBe(2);
  });

  it("include() loads a N:1 relation", async () => {
    const contract = makeTestContract(
      { posts: "Post" },
      {
        Post: {
          storeName: "posts",
          keyPath: "id",
          relations: {
            author: {
              to: "User",
              cardinality: "N:1",
              on: { localFields: ["authorId"], targetFields: ["id"] },
            },
          },
        },
        User: {
          storeName: "users",
          keyPath: "id",
        },
      }
    );
    const client = asRecord(idbOrm({ contract, executor }));
    const rows = await client["posts"]!.include("author").all().toArray();
    const postA = rows.find((r) => (r as Record<string, unknown>)["id"] === "p1");
    expect(postA).toBeDefined();
    const author = (postA as Record<string, unknown>)["author"];
    expect(author).toBeDefined();
    expect((author as Record<string, unknown>)["id"]).toBe("u1");
  });
});
