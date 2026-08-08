import { describe, expect, it } from "vitest";
import { getNextBatch, markFailed, markSynced } from "../src/core/outbox-store";
import type { OutboxEvent, VersionMetaRecord } from "../src/types";
import { createTestSyncClient, keyGet, scanAll } from "./helpers";

async function getOutboxEvent(
  client: Awaited<ReturnType<typeof createTestSyncClient>>["client"],
  id: string
): Promise<OutboxEvent | undefined> {
  return (await keyGet(client, "_idb_sync_outbox", id)) as OutboxEvent | undefined;
}

async function getVersionMeta(
  client: Awaited<ReturnType<typeof createTestSyncClient>>["client"],
  id: string
): Promise<VersionMetaRecord | undefined> {
  return (await keyGet(client, "_idb_sync_version_meta", id)) as VersionMetaRecord | undefined;
}

function outboxEvent(overrides: Partial<OutboxEvent> & Pick<OutboxEvent, "id">): OutboxEvent {
  return {
    entityType: "User",
    operation: "create",
    payload: {},
    createdAt: new Date(),
    synced: false,
    syncedAt: null,
    lastAttemptedAt: null,
    tries: 0,
    lastError: null,
    retryable: true,
    versionMetaId: null,
    ...overrides,
  };
}

describe("getNextBatch", () => {
  it("returns only unsynced, retryable events, sorted oldest-first", async () => {
    const { client } = await createTestSyncClient();
    await client.withTransaction(["_idb_sync_outbox"], async (scope) => {
      await scope.execute({
        kind: "add",
        storeName: "_idb_sync_outbox",
        record: outboxEvent({ id: "e2", createdAt: new Date("2026-01-02") }) as unknown as Record<string, unknown>,
      } as never);
      await scope.execute({
        kind: "add",
        storeName: "_idb_sync_outbox",
        record: outboxEvent({ id: "e1", createdAt: new Date("2026-01-01") }) as unknown as Record<string, unknown>,
      } as never);
      await scope.execute({
        kind: "add",
        storeName: "_idb_sync_outbox",
        record: outboxEvent({ id: "e-synced", synced: true }) as unknown as Record<string, unknown>,
      } as never);
      await scope.execute({
        kind: "add",
        storeName: "_idb_sync_outbox",
        record: outboxEvent({ id: "e-dead", retryable: false }) as unknown as Record<string, unknown>,
      } as never);
    });

    const batch = await getNextBatch(client.rawClient);

    expect(batch.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("respects the limit option", async () => {
    const { client } = await createTestSyncClient();
    await client.withTransaction(["_idb_sync_outbox"], async (scope) => {
      for (const id of ["e1", "e2", "e3"]) {
        await scope.execute({
          kind: "add",
          storeName: "_idb_sync_outbox",
          record: outboxEvent({ id }) as unknown as Record<string, unknown>,
        } as never);
      }
    });

    const batch = await getNextBatch(client.rawClient, { limit: 2 });

    expect(batch).toHaveLength(2);
  });
});

describe("markSynced", () => {
  it("sets synced + syncedAt and clears localChangePending on the linked version-meta row", async () => {
    const { client } = await createTestSyncClient();
    await client.withTransaction(["_idb_sync_outbox", "_idb_sync_version_meta"], async (scope) => {
      await scope.execute({
        kind: "add",
        storeName: "_idb_sync_outbox",
        record: outboxEvent({ id: "e1", versionMetaId: 'User::"u1"' }) as unknown as Record<string, unknown>,
      } as never);
      await scope.execute({
        kind: "add",
        storeName: "_idb_sync_version_meta",
        record: {
          id: 'User::"u1"',
          model: "User",
          key: "u1",
          lastAppliedChangeId: null,
          localChangePending: true,
        },
      } as never);
    });

    await client.withTransaction(["_idb_sync_outbox", "_idb_sync_version_meta"], async (scope) => {
      await markSynced(scope, "e1");
    });

    const event = await getOutboxEvent(client, "e1");
    expect(event?.synced).toBe(true);
    expect(event?.syncedAt).toBeInstanceOf(Date);

    const meta = await getVersionMeta(client, 'User::"u1"');
    expect(meta?.localChangePending).toBe(false);
  });

  it("does nothing when versionMetaId is null", async () => {
    const { client } = await createTestSyncClient();
    await client.withTransaction(["_idb_sync_outbox"], async (scope) => {
      await scope.execute({
        kind: "add",
        storeName: "_idb_sync_outbox",
        record: outboxEvent({ id: "e1", versionMetaId: null }) as unknown as Record<string, unknown>,
      } as never);
    });

    await client.withTransaction(["_idb_sync_outbox", "_idb_sync_version_meta"], async (scope) => {
      await expect(markSynced(scope, "e1")).resolves.toBeUndefined();
    });

    const event = await getOutboxEvent(client, "e1");
    expect(event?.synced).toBe(true);
  });

  it("does nothing when the event id doesn't exist", async () => {
    const { client } = await createTestSyncClient();

    await client.withTransaction(["_idb_sync_outbox", "_idb_sync_version_meta"], async (scope) => {
      await expect(markSynced(scope, "nonexistent")).resolves.toBeUndefined();
    });

    expect(await scanAll(client, "_idb_sync_outbox")).toHaveLength(0);
  });
});

describe("markFailed", () => {
  it("increments tries and stores the error, keeping retryable while under the cap", async () => {
    const { client } = await createTestSyncClient();
    await client.withTransaction(["_idb_sync_outbox"], async (scope) => {
      await scope.execute({
        kind: "add",
        storeName: "_idb_sync_outbox",
        record: outboxEvent({ id: "e1" }) as unknown as Record<string, unknown>,
      } as never);
    });

    await client.withTransaction(["_idb_sync_outbox"], async (scope) => {
      await markFailed(scope, "e1", "network error");
    });

    const event = await getOutboxEvent(client, "e1");
    expect(event?.tries).toBe(1);
    expect(event?.lastError).toBe("network error");
    expect(event?.lastAttemptedAt).toBeInstanceOf(Date);
    expect(event?.retryable).toBe(true);
  });

  it("flips retryable to false once tries reaches 10", async () => {
    const { client } = await createTestSyncClient();
    await client.withTransaction(["_idb_sync_outbox"], async (scope) => {
      await scope.execute({
        kind: "add",
        storeName: "_idb_sync_outbox",
        record: outboxEvent({ id: "e1", tries: 9 }) as unknown as Record<string, unknown>,
      } as never);
    });

    await client.withTransaction(["_idb_sync_outbox"], async (scope) => {
      await markFailed(scope, "e1", "still failing");
    });

    const event = await getOutboxEvent(client, "e1");
    expect(event?.tries).toBe(10);
    expect(event?.retryable).toBe(false);
  });
});
