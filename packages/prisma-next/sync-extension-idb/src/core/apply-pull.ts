/**
 * `applyPull` — apply server changelog entries to the local IDB.
 *
 * Uses `withoutTracking` so applied server changes do NOT generate outbox
 * events (they came from the server — tracking them would create a push loop).
 *
 * Guards per log entry:
 * 1. **Staleness**: skip if `lastAppliedChangeId >= log.changelogId` (already newer).
 * 2. **Pending push**: skip if `localChangePending === true` (local mutation
 *    not yet confirmed synced — let it win to avoid last-write-wins races).
 */

import type { IdbAtomicPlan } from "@prisma-next-idb/driver-idb/runtime";
import type { IdbContract } from "@prisma-next-idb/client-idb/orm";
import type { SyncIdbClient } from "./sync-client";
import type { LogWithRecord, ApplyPullResult } from "../types";

const VERSION_META = "_idb_sync_version_meta";

function versionMetaKey(model: string, key: unknown): string {
  return `${model}::${JSON.stringify(key)}`;
}

export async function applyPull<TContract extends IdbContract>(
  syncClient: SyncIdbClient<TContract>,
  logs: LogWithRecord[]
): Promise<ApplyPullResult> {
  let applied = 0;
  let skipped = 0;
  let lastChangelogId: string | null = null;

  for (const log of logs) {
    const metaId = versionMetaKey(log.model, log.keyPath);

    // Read VersionMeta and decide whether to apply.
    let shouldApply = true;

    await syncClient.withTransaction([VERSION_META], async (scope) => {
      const rows = await scope.execute({
        kind: "key-get",
        storeName: VERSION_META,
        key: metaId,
      } as unknown as IdbAtomicPlan);
      const meta = rows[0] as { lastAppliedChangeId: string | null; localChangePending: boolean } | undefined;

      if (meta) {
        if (meta.localChangePending) {
          shouldApply = false;
          return;
        }
        if (meta.lastAppliedChangeId !== null && meta.lastAppliedChangeId >= log.changelogId) {
          shouldApply = false;
          return;
        }
      }
    });

    if (!shouldApply) {
      skipped++;
      continue;
    }

    // Apply the change via rawOrm (no outbox tracking).
    // We erase types here because the raw ORM's generic types don't align with
    // the dynamic model name dispatch we need. The underlying store accessors
    // do accept Record<string, unknown> payloads at runtime.
    const rawOrmAny = syncClient.rawClient.orm as unknown as Record<
      string,
      {
        upsert: (args: {
          create: Record<string, unknown>;
          update: Record<string, unknown>;
          where: Record<string, unknown>;
        }) => Promise<unknown>;
        delete: (key: unknown) => Promise<void>;
      }
    >;

    const storeAccessor = rawOrmAny[log.model];
    if (!storeAccessor) {
      skipped++;
      continue;
    }

    try {
      if (log.operation === "create" || log.operation === "update") {
        if (log.record === null) {
          skipped++;
          continue;
        }
        // Upsert semantics: put the full server record regardless of local state.
        await syncClient.withoutTracking(async (rawOrm) => {
          const accessor = (
            rawOrm as unknown as Record<
              string,
              {
                upsert: (args: {
                  create: Record<string, unknown>;
                  update: Record<string, unknown>;
                  where: Record<string, unknown>;
                }) => Promise<unknown>;
              }
            >
          )[log.model];
          if (!accessor) return;
          await accessor.upsert({
            create: log.record!,
            update: log.record!,
            where: { id: log.keyPath },
          });
        });
      } else if (log.operation === "delete") {
        await syncClient.withoutTracking(async (rawOrm) => {
          const accessor = (rawOrm as unknown as Record<string, { delete: (key: unknown) => Promise<void> }>)[
            log.model
          ];
          if (!accessor) return;
          await accessor.delete(log.keyPath);
        });
      }
    } catch {
      // If the apply fails (e.g. record not found for delete), skip silently.
      skipped++;
      continue;
    }

    // Update VersionMeta to record the applied changelogId.
    await syncClient.withTransaction([VERSION_META], async (scope) => {
      await scope.execute({
        kind: "put",
        storeName: VERSION_META,
        record: {
          id: metaId,
          model: log.model,
          key: log.keyPath,
          lastAppliedChangeId: log.changelogId,
          localChangePending: false,
        },
      } as unknown as IdbAtomicPlan);
    });

    applied++;
    if (lastChangelogId === null || log.changelogId > lastChangelogId) {
      lastChangelogId = log.changelogId;
    }
  }

  return { applied, skipped, lastChangelogId };
}
