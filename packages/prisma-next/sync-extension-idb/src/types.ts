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
