/**
 * Low-level read/write helpers for `_idb_sync_outbox`.
 *
 * These functions operate directly on `IdbTransactionScope` (for writes) or
 * `IdbClient` (for reads that open their own transaction). They do NOT go
 * through the ORM so as not to trigger the sync interceptor.
 */

import type { IdbAtomicPlan, IdbTransactionScope } from "@prisma-next-idb/driver-idb/runtime";
import type { IdbClient } from "@prisma-next-idb/client-idb/client";
import type { IdbContract } from "@prisma-next-idb/client-idb/orm";
import type { OutboxEvent } from "../types";

export type { OutboxEvent };

const OUTBOX = "_idb_sync_outbox";
const VERSION_META = "_idb_sync_version_meta";

// ── Read helpers ──────────────────────────────────────────────────────────────

/**
 * Fetch the next batch of unsynced, retryable outbox events sorted by
 * `createdAt` ascending (oldest-first → FIFO ordering for push).
 *
 * Filters `synced`/`retryable` in-memory over a full store scan rather than
 * querying the `bySynced` index via `IDBKeyRange.only(false)` — `boolean` is
 * not a valid IndexedDB key type (still an open spec proposal:
 * https://github.com/w3c/IndexedDB/issues/76), so that range construction
 * throws a `DataError` in every real IndexedDB implementation. The
 * `bySynced` index itself is left in the contract (removing it is a schema
 * change requiring a migration) but is not queried by range here.
 */
export async function getNextBatch<TContract extends IdbContract>(
  client: IdbClient<TContract>,
  options?: { limit?: number }
): Promise<OutboxEvent[]> {
  const limit = options?.limit ?? 20;
  const events: OutboxEvent[] = [];

  await client.withTransaction([OUTBOX], async (scope) => {
    const rows = await scope.execute({
      kind: "cursor-scan",
      storeName: OUTBOX,
    } as unknown as IdbAtomicPlan);
    // Sort by createdAt ascending and apply limit in-memory.
    const unsorted = rows as unknown as OutboxEvent[];
    const sorted = unsorted
      .filter((e) => !e.synced && e.retryable)
      .sort((a, b) => {
        const at = (d: Date | null) => (d instanceof Date ? d.getTime() : 0);
        return at(a.createdAt) - at(b.createdAt);
      });
    for (const e of sorted.slice(0, limit)) events.push(e);
  });

  return events;
}

// ── Write helpers (inside an existing transaction scope) ──────────────────────

/** Mark an outbox event as successfully synced. */
export async function markSynced(scope: IdbTransactionScope, id: string): Promise<void> {
  const rows = await scope.execute({ kind: "key-get", storeName: OUTBOX, key: id } as unknown as IdbAtomicPlan);
  const existing = rows[0] as OutboxEvent | undefined;
  if (!existing) return;
  await scope.execute({
    kind: "put",
    storeName: OUTBOX,
    record: {
      ...existing,
      synced: true,
      syncedAt: new Date(),
    } as unknown as Record<string, unknown>,
  } as unknown as IdbAtomicPlan);
  // Clear the localChangePending flag in version meta if it was set. Read
  // the id persisted at write time (`SyncInterceptorExecutor`'s
  // `versionMetaKey(modelName, key)`) rather than re-deriving it from the
  // payload — the payload shape differs per operation (create/update/delete)
  // and re-deriving it here previously matched only `create` on models keyed
  // by a literal `id` field, so `localChangePending` never cleared for
  // update/delete and `applyPull` skipped all future server changes for
  // that record.
  const metaId = existing.versionMetaId;
  if (metaId === null || metaId === undefined) return;
  const metaRows = await scope.execute({
    kind: "key-get",
    storeName: VERSION_META,
    key: metaId,
  } as unknown as IdbAtomicPlan);
  const meta = metaRows[0] as Record<string, unknown> | undefined;
  if (meta) {
    await scope.execute({
      kind: "put",
      storeName: VERSION_META,
      record: { ...meta, localChangePending: false },
    } as unknown as IdbAtomicPlan);
  }
}

/** Record a push failure — increment tries, store error, mark non-retryable after too many attempts. */
export async function markFailed(scope: IdbTransactionScope, id: string, error: string): Promise<void> {
  const rows = await scope.execute({ kind: "key-get", storeName: OUTBOX, key: id } as unknown as IdbAtomicPlan);
  const existing = rows[0] as OutboxEvent | undefined;
  if (!existing) return;
  const tries = existing.tries + 1;
  await scope.execute({
    kind: "put",
    storeName: OUTBOX,
    record: {
      ...existing,
      tries,
      lastError: error,
      lastAttemptedAt: new Date(),
      retryable: tries < 10,
    } as unknown as Record<string, unknown>,
  } as unknown as IdbAtomicPlan);
}
