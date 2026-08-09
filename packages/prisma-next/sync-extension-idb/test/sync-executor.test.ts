/**
 * SyncInterceptorExecutor — exercised through a real createSyncIdbClient
 * against fake-indexeddb (not mocked at the plan level), since the whole
 * point is that the extended batch plan actually reaches the driver and
 * commits atomically in one IDB transaction.
 */
import { describe, expect, it } from "vitest";
import { asAccessors, createTestSyncClient, keyGet, scanAll } from "./helpers";

describe("SyncInterceptorExecutor", () => {
  it("writes an outbox event + version-meta row alongside a tracked create", async () => {
    const { client } = await createTestSyncClient();

    await asAccessors(client.orm)["users"]!.create({ id: "u1", name: "Alice" });

    const outbox = await scanAll(client, "_idb_sync_outbox");
    expect(outbox).toHaveLength(1);
    const event = outbox[0] as { entityType: string; operation: string; synced: boolean; versionMetaId: string };
    expect(event.entityType).toBe("User");
    expect(event.operation).toBe("create");
    expect(event.synced).toBe(false);
    expect(event.versionMetaId).toBe('User::"u1"');

    const metaRow = await keyGet(client, "_idb_sync_version_meta", event.versionMetaId);
    expect(metaRow).toBeDefined();
    expect((metaRow as { localChangePending: boolean }).localChangePending).toBe(true);
    expect((metaRow as { lastAppliedChangeId: string | null }).lastAppliedChangeId).toBeNull();

    const users = await scanAll(client, "users");
    expect(users).toEqual([{ id: "u1", name: "Alice" }]);
  });

  it("onOutboxWrite fires once per tracked write, after it's committed", async () => {
    const { client } = await createTestSyncClient();
    const users = asAccessors(client.orm)["users"]!;

    const calls: number[] = [];
    const unsubscribe = client.onOutboxWrite(() => calls.push((calls.length ?? 0) + 1));

    await users.create({ id: "u1", name: "Alice" });
    // Fired only after the write actually landed — not eagerly before it.
    expect(await scanAll(client, "_idb_sync_outbox")).toHaveLength(1);
    expect(calls).toHaveLength(1);

    await users.where({ id: "u1" }).update({ name: "Alicia" });
    expect(calls).toHaveLength(2);

    unsubscribe();
    await users.delete("u1");
    expect(calls).toHaveLength(2); // no longer subscribed
  });

  it("onOutboxWrite does not fire for an untracked model", async () => {
    const { client } = await createTestSyncClient({ trackedModels: ["Post"] });
    const users = asAccessors(client.orm)["users"]!;

    const calls: number[] = [];
    client.onOutboxWrite(() => calls.push(1));

    await users.create({ id: "u1", name: "Alice" });
    expect(calls).toHaveLength(0);
  });

  it("does not intercept an untracked model", async () => {
    const { client } = await createTestSyncClient({ trackedModels: ["Post"] });

    await asAccessors(client.orm)["users"]!.create({ id: "u1", name: "Alice" });

    const outbox = await scanAll(client, "_idb_sync_outbox");
    expect(outbox).toHaveLength(0);
  });

  it("omits versionMetaId when the key cannot be determined statically (updateAll)", async () => {
    const { client } = await createTestSyncClient();
    const users = asAccessors(client.orm)["users"]!;

    await users.create({ id: "u1", name: "Alice" });
    await users.updateAll({ name: "Alicia" }).toArray();

    const outbox = await scanAll(client, "_idb_sync_outbox");
    const updateAllEvent = (outbox as { operation: string; versionMetaId: string | null }[]).find(
      (e) => e.operation === "update"
    );
    expect(updateAllEvent).toBeDefined();
    expect(updateAllEvent!.versionMetaId).toBeNull();
  });

  it("writes a delete outbox event with a statically-known key", async () => {
    const { client } = await createTestSyncClient();
    const users = asAccessors(client.orm)["users"]!;

    await users.create({ id: "u1", name: "Alice" });
    await users.delete("u1");

    const outbox = await scanAll(client, "_idb_sync_outbox");
    const deleteEvent = (outbox as { operation: string; versionMetaId: string | null }[]).find(
      (e) => e.operation === "delete"
    );
    expect(deleteEvent).toBeDefined();
    expect(deleteEvent!.versionMetaId).toBe('User::"u1"');
  });
});

describe("SyncInterceptorExecutor.transaction() — relational mutations", () => {
  it("tracks a create on a model with a scalar FK field (previously threw: 'requires transaction support')", async () => {
    const { client } = await createTestSyncClient();
    const users = asAccessors(client.orm)["users"]!;
    const posts = asAccessors(client.orm)["posts"]!;

    await users.create({ id: "u1", name: "Alice" });
    await posts.create({ id: "p1", title: "Hi", authorId: "u1" });

    const outbox = await scanAll(client, "_idb_sync_outbox");
    const postCreate = (outbox as { entityType: string; operation: string; versionMetaId: string | null }[]).find(
      (e) => e.entityType === "Post" && e.operation === "create"
    );
    expect(postCreate).toBeDefined();
    expect(postCreate!.versionMetaId).toBe('Post::"p1"');

    const metaRow = await keyGet(client, "_idb_sync_version_meta", postCreate!.versionMetaId!);
    expect(metaRow).toBeDefined();
  });

  it("tracks a delete on a model with enforceable child relations, cascading the children locally", async () => {
    const { client } = await createTestSyncClient();
    const users = asAccessors(client.orm)["users"]!;
    const posts = asAccessors(client.orm)["posts"]!;

    await users.create({ id: "u1", name: "Alice" });
    await posts.create({ id: "p1", title: "Hi", authorId: "u1" });
    await users.delete("u1");

    // The cascade (onDelete: cascade) removed the child Post locally.
    expect(await scanAll(client, "posts")).toHaveLength(0);

    // The explicitly-deleted User is tracked...
    const outbox = await scanAll(client, "_idb_sync_outbox");
    const userDelete = (outbox as { entityType: string; operation: string }[]).find(
      (e) => e.entityType === "User" && e.operation === "delete"
    );
    expect(userDelete).toBeDefined();

    // ...and so is the cascade-deleted Post: `applyReferentialActionsForRow`
    // issues the cascade as a `scan-write` (write: "delete") against the
    // same wrapped transaction scope, and every row it actually removes
    // gets its own outbox event, keyed by that row's own primary key.
    const postDelete = (outbox as { entityType: string; operation: string; versionMetaId: string | null }[]).find(
      (e) => e.entityType === "Post" && e.operation === "delete"
    );
    expect(postDelete).toBeDefined();
    expect(postDelete!.versionMetaId).toBe('Post::"p1"');

    const metaRow = await keyGet(client, "_idb_sync_version_meta", postDelete!.versionMetaId!);
    expect(metaRow).toBeDefined();
  });

  it("onOutboxWrite fires for writes issued via the transaction() path too, once per affected row", async () => {
    const { client } = await createTestSyncClient();
    const users = asAccessors(client.orm)["users"]!;
    const posts = asAccessors(client.orm)["posts"]!;

    await users.create({ id: "u1", name: "Alice" });
    await posts.create({ id: "p1", title: "Hi", authorId: "u1" });

    let writes = 0;
    client.onOutboxWrite(() => writes++);

    // Cascade-deletes the one Post too — two rows written, two notifications.
    await users.delete("u1");
    expect(writes).toBe(2);
  });

  it("tracks a scan-write update (executeScalarUpdateWithFkValidation's put-merged path)", async () => {
    const { client } = await createTestSyncClient();
    const users = asAccessors(client.orm)["users"]!;
    const posts = asAccessors(client.orm)["posts"]!;

    await users.create({ id: "u1", name: "Alice" });
    await users.create({ id: "u2", name: "Bob" });
    await posts.create({ id: "p1", title: "Hi", authorId: "u1" });
    // Patching a scalar FK field routes through executeScalarUpdateWithFkValidation
    // (FK-existence validation), which issues a scan-write (put-merged, take: 1)
    // against the transaction scope rather than a plain "update" plan.
    await posts.where({ id: "p1" }).update({ authorId: "u2" });

    const outbox = await scanAll(client, "_idb_sync_outbox");
    const postUpdate = (outbox as { entityType: string; operation: string; versionMetaId: string | null }[]).find(
      (e) => e.entityType === "Post" && e.operation === "update"
    );
    expect(postUpdate).toBeDefined();
    expect(postUpdate!.versionMetaId).toBe('Post::"p1"');
  });
});
