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

export const POST: RequestHandler = async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user.id) return json({ error: "Unauthorized" }, { status: 401 });
  const scopeKey = session.user.id;

  const body = (await request.json()) as Partial<PushRequestBody>;
  if (!Array.isArray(body.events)) {
    return json({ error: "events (array) is required" }, { status: 400 });
  }
  const { events } = body as PushRequestBody;

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
