/** Outbox event record stored in `_idb_sync_outbox`. */
export interface OutboxEvent {
  id: string;
  entityType: string;
  operation: string;
  payload: unknown;
  createdAt: Date;
  synced: boolean;
  syncedAt: Date | null;
  lastAttemptedAt: Date | null;
  tries: number;
  lastError: string | null;
  retryable: boolean;
  /**
   * The `_idb_sync_version_meta` record id this event's mutation was keyed
   * under (same value as `versionMetaKey(modelName, key)`), or `null` when
   * the key couldn't be determined statically (scan-writes, upsert, bulk
   * ops — see `extractKey` in `sync-executor.ts`). `markSynced` reads this
   * back to clear `localChangePending` on the matching version-meta row.
   */
  versionMetaId: string | null;
}

/** Version-meta record stored in `_idb_sync_version_meta`. */
export interface VersionMetaRecord {
  id: string;
  model: string;
  key: unknown;
  lastAppliedChangeId: string | null;
  localChangePending: boolean;
}

/** Server changelog entry returned by the pull endpoint. */
export interface LogWithRecord {
  changelogId: string;
  model: string;
  operation: "create" | "update" | "delete";
  keyPath: unknown;
  record: Record<string, unknown> | null;
}

/** Per-event result from the push endpoint. */
export interface PushResult {
  id: string;
  success: boolean;
  error?: string;
}

/** Stats returned by `applyPull`. */
export interface ApplyPullResult {
  applied: number;
  skipped: number;
  lastChangelogId: string | null;
}
