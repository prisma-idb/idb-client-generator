import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getPostgres } from "$lib/server/db";
import { syncServer } from "$lib/server/sync";
import { resolvePullRecord } from "$lib/server/sync-sql-adapter";

/**
 * ADR 014's pull endpoint — two steps, per sync-server's README (execution
 * lives in `sync-sql-adapter.ts` — this file is just the HTTP boundary):
 *
 * 1. Cheap pre-filter on Changelog, scoped by `scopeKey` (stamped at push
 *    time, see push/+server.ts) and a cursor (`.cursor({ id: since })`).
 *    This is the caller's own storage; sync-server has no opinion on it.
 * 2. Live re-check via `buildPullQueries`, then re-fetch each authorized
 *    row's *current* state from the real model table — not from anything
 *    cached on the changelog row itself. An unauthorized/deleted row comes
 *    back as `record: null`, which `applyPull` (sync-extension-idb) treats
 *    as a local delete.
 *
 * Same demo-level caveat as push/+server.ts: `scopeKey` is trusted as
 * given, no real auth.
 */

export const GET: RequestHandler = async ({ url }) => {
  const scopeKey = url.searchParams.get("scopeKey");
  const since = url.searchParams.get("since");
  if (!scopeKey) return json({ error: "scopeKey is required" }, { status: 400 });

  const db = await getPostgres();

  const ordered = db.orm.public.Changelog.where({ scopeKey })
    .select("id", "model", "keyPath", "operation")
    .orderBy((c) => c.id.asc());
  const rows = await (since ? ordered.cursor({ id: Number(since) }) : ordered).take(50).all();

  const pullLogs = rows.map((row) => ({ changelogId: String(row.id), model: row.model, key: row.keyPath }));
  const checks = syncServer.buildPullQueries(pullLogs, { scopeKey });

  const logs = await Promise.all(
    checks.map(async ({ changelogId, model, check }) => {
      const sourceRow = rows.find((r) => String(r.id) === changelogId)!;
      const operation = sourceRow.operation as "create" | "update" | "delete";
      const keyPath = sourceRow.keyPath;
      const record = await resolvePullRecord(db, model, check, keyPath, operation);
      return { changelogId, model, operation, keyPath, record };
    })
  );

  return json(logs);
};
