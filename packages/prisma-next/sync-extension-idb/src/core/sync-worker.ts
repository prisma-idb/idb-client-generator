/**
 * SyncWorker — push/pull loop with backoff and EventTarget-style events.
 */

import type { IdbContract } from "@prisma-next-idb/client-idb/orm";
import type { SyncIdbClient } from "./sync-client";
import type { OutboxEvent } from "./outbox-store";
import { getNextBatch, markSynced, markFailed } from "./outbox-store";
import { applyPull } from "./apply-pull";
import type { LogWithRecord, PushResult } from "../types";

// ── Public types ──────────────────────────────────────────────────────────────

export type SyncWorkerStatus = "idle" | "pushing" | "pulling" | "error" | "stopped";

export interface SyncWorkerOptions<TContract extends IdbContract> {
  readonly syncClient: SyncIdbClient<TContract>;
  /** Called with a batch of unsynced events. Must return per-event results. */
  readonly pushHandler: (events: OutboxEvent[]) => Promise<PushResult[]>;
  /** Called with the last applied changelog ID (null if none). Returns new logs. */
  readonly pullHandler: (fromChangelogId: string | null) => Promise<LogWithRecord[]>;
  /** Max events per push batch. Default 20. */
  readonly batchSize?: number;
  /** Milliseconds between sync cycles when idle. Default 5000. */
  readonly intervalMs?: number;
  /** Base backoff in ms on consecutive failures. Default 1000. */
  readonly backoffBaseMs?: number;
  /** Max backoff cap in ms. Default 30000. */
  readonly backoffMaxMs?: number;
}

export interface PushCompletedEvent {
  synced: number;
  failed: number;
}
export interface PullCompletedEvent {
  applied: number;
  skipped: number;
}

type SyncEventMap = {
  statuschange: SyncWorkerStatus;
  pushcompleted: PushCompletedEvent;
  pullcompleted: PullCompletedEvent;
};

export interface SyncWorker {
  /** Begin the push/pull loop. No-op if already running. */
  start(): void;
  /** Stop the loop. In-flight cycle completes; no new cycles start. */
  stop(): void;
  /** Trigger one push/pull cycle immediately, ignoring backoff. */
  forceSync(): Promise<void>;
  /** Register an event listener. Returns an unsubscribe function. */
  on<K extends keyof SyncEventMap>(event: K, cb: (payload: SyncEventMap[K]) => void): () => void;
  /** Current worker status. */
  readonly status: SyncWorkerStatus;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createSyncWorker<TContract extends IdbContract>(options: SyncWorkerOptions<TContract>): SyncWorker {
  const {
    syncClient,
    pushHandler,
    pullHandler,
    batchSize = 20,
    intervalMs = 5_000,
    backoffBaseMs = 1_000,
    backoffMaxMs = 30_000,
  } = options;

  let status: SyncWorkerStatus = "idle";
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let consecutiveFailures = 0;
  let lastChangelogId: string | null = null;

  const listeners = new Map<keyof SyncEventMap, Set<(payload: unknown) => void>>();

  function emit<K extends keyof SyncEventMap>(event: K, payload: SyncEventMap[K]): void {
    const set = listeners.get(event);
    if (!set) return;
    for (const cb of set) cb(payload);
  }

  function setStatus(next: SyncWorkerStatus): void {
    if (status === next) return;
    status = next;
    emit("statuschange", next);
  }

  async function runCycle(): Promise<void> {
    // ── Push ─────────────────────────────────────────────────────────────────
    setStatus("pushing");
    const events = await getNextBatch(syncClient.rawClient, { limit: batchSize });

    if (events.length > 0) {
      let pushSynced = 0;
      let pushFailed = 0;
      const results = await pushHandler(events);
      await syncClient.withTransaction(["_idb_sync_outbox", "_idb_sync_version_meta"], async (scope) => {
        for (const result of results) {
          if (result.success) {
            await markSynced(scope, result.id);
            pushSynced++;
          } else {
            await markFailed(scope, result.id, result.error ?? "unknown error");
            pushFailed++;
          }
        }
      });
      emit("pushcompleted", { synced: pushSynced, failed: pushFailed });
    }

    // ── Pull ─────────────────────────────────────────────────────────────────
    setStatus("pulling");
    const logs = await pullHandler(lastChangelogId);

    if (logs.length > 0) {
      const { applied, skipped, lastChangelogId: newId } = await applyPull(syncClient, logs);
      if (newId !== null) lastChangelogId = newId;
      emit("pullcompleted", { applied, skipped });
    } else {
      emit("pullcompleted", { applied: 0, skipped: 0 });
    }
  }

  async function tick(): Promise<void> {
    if (stopped) return;
    try {
      await runCycle();
      consecutiveFailures = 0;
      setStatus("idle");
    } catch {
      consecutiveFailures++;
      setStatus("error");
    }
    if (!stopped) {
      const backoff = Math.min(
        consecutiveFailures > 0 ? backoffBaseMs * Math.pow(2, consecutiveFailures - 1) : intervalMs,
        backoffMaxMs
      );
      timer = setTimeout(() => void tick(), backoff);
    }
  }

  return {
    get status() {
      return status;
    },
    start() {
      if (stopped || timer !== null) return;
      stopped = false;
      void tick();
    },
    stop() {
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      setStatus("stopped");
    },
    async forceSync() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      await runCycle();
      if (!stopped) {
        timer = setTimeout(() => void tick(), intervalMs);
      }
    },
    on<K extends keyof SyncEventMap>(event: K, cb: (payload: SyncEventMap[K]) => void): () => void {
      if (!listeners.has(event)) listeners.set(event, new Set());
      const set = listeners.get(event)!;
      set.add(cb as (payload: unknown) => void);
      return () => set.delete(cb as (payload: unknown) => void);
    },
  };
}
