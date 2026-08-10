import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { auth } from "$lib/server/auth";
import { getPostgres } from "$lib/server/db";
import { syncServer } from "$lib/server/sync";
import { applyPushEvent, getKeyField, toSyncPushPayload } from "$lib/server/sync-sql-adapter";
import type { PushEventBody, PushResultBody } from "$lib/server/sync-sql-adapter";

/**
 * ADR 014's push endpoint: validate ownership via `@prisma-next-idb/sync-server`,
 * then apply authorized writes to the real Postgres tables (execution lives
 * in `sync-sql-adapter.ts` — this file is just the HTTP boundary). `scopeKey`
 * is the authenticated session's user id, resolved server-side from the
 * request's session cookie (`auth.api.getSession`) — never trusted from the
 * request body, so a client can't claim to push as a different user.
 */

interface PushRequestBody {
  readonly events: readonly PushEventBody[];
}

// The real client only ever pushes `SyncWorkerOptions.batchSize` events at a
// time (default 20, see sync-worker.ts) — generous headroom over that, not a
// tuned limit, just a bound so a crafted request can't force an unbounded
// number of sequential per-event transactions (see the loop below's own
// comment on why these run sequentially, not concurrently).
const MAX_PUSH_BATCH_SIZE = 1000;

function isPushEventBody(value: unknown): value is PushEventBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.entityType === "string" && typeof v.operation === "string";
}

export const POST: RequestHandler = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user.id) return json({ error: "Unauthorized" }, { status: 401 });
  const scopeKey = session.user.id;

  let body: Partial<PushRequestBody>;
  try {
    body = (await request.json()) as Partial<PushRequestBody>;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return json({ error: "Invalid body" }, { status: 400 });
  }
  if (!Array.isArray(body.events)) {
    return json({ error: "events (array) is required" }, { status: 400 });
  }
  if (body.events.length > MAX_PUSH_BATCH_SIZE) {
    return json({ error: `events exceeds max batch size of ${MAX_PUSH_BATCH_SIZE}` }, { status: 400 });
  }
  if (!body.events.every(isPushEventBody)) {
    return json({ error: "Malformed event in events array" }, { status: 400 });
  }
  const { events } = body as PushRequestBody;

  // Reject outright rather than silently double-applying or dropping one:
  // the loop below re-matches each check back to its event by id
  // (`events.find`), which only holds up if ids are actually unique within
  // the batch. A legitimate client's own outbox ids are always unique
  // (crypto.randomUUID() per write) — this only ever fires on a malformed
  // or crafted request.
  const seenEventIds = new Set<string>();
  for (const event of events) {
    if (seenEventIds.has(event.id)) {
      return json({ error: "Duplicate event id in push batch" }, { status: 400 });
    }
    seenEventIds.add(event.id);
  }

  const db = await getPostgres();
  const results: PushResultBody[] = [];

  // Resolved per event, not per batch: an unknown entityType or unsupported
  // operation should fail only that event (non-retryable — resubmitting the
  // same event won't change the outcome), not crash the whole batch.
  const pushEvents: {
    id: string;
    model: string;
    operation: "create" | "update" | "delete";
    payload: Record<string, unknown>;
  }[] = [];
  for (const event of events) {
    try {
      pushEvents.push({
        id: event.id,
        model: event.entityType,
        operation: event.operation as "create" | "update" | "delete",
        payload: toSyncPushPayload(event.operation, event.payload, getKeyField(event.entityType)),
      });
    } catch (err) {
      results.push({
        id: event.id,
        success: false,
        error: err instanceof Error ? err.message : "Unsupported event",
        retryable: false,
      });
    }
  }

  const checks = syncServer.validatePush(pushEvents, { scopeKey });

  // Sequential, not Promise.all: a batch can carry data dependencies (a
  // Todo created right after the Board it belongs to) — running checks
  // concurrently raced the Board's own not-yet-committed transaction,
  // making the Todo's ownership walk read a Board that didn't exist yet.
  // Matches the old generator's applyPush, which processed events in a
  // plain `for` loop for the same reason.
  for (const { eventId, model, check } of checks) {
    const event = events.find((e) => e.id === eventId)!;
    results.push(await applyPushEvent(db, event, model, check, scopeKey));
  }

  return json(results);
};
