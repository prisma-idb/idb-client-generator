import { domainModelsAtDefaultNamespace } from "@prisma-next/contract/types";
import type { OwnershipCheck } from "@prisma-next-idb/sync-server";
import { serverContract, sqlGetKeyField } from "./sync";
import { getPostgres } from "./db";

/**
 * Executes `@prisma-next-idb/sync-server`'s `OwnershipCheck` descriptions
 * against the real Postgres ORM (ADR 014's transport-agnostic boundary —
 * sync-server describes *what* to check, this is the caller's "turn it
 * into a real query" half, the sync-server README sketches). Everything
 * here is generic over model/contract, not Board/Todo/User-specific, so
 * `push/+server.ts` and `pull/+server.ts` shrink to HTTP parsing +
 * `json(...)` around calls into this file.
 */

// ── Dynamic ORM access ───────────────────────────────────────────────────────

type OrmRoot = {
  first(where: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  select(...fields: string[]): {
    create(data: Record<string, unknown>): Promise<unknown>;
    where(clause: Record<string, unknown>): {
      update(patch: Record<string, unknown>): Promise<unknown>;
    };
  };
  where(clause: Record<string, unknown>): {
    delete(): Promise<unknown>;
  };
};

/**
 * Postgres' generated types don't type-narrow a dynamic model-name lookup —
 * this is app code, not library code. `.select(keyField)` before
 * `create`/`update`: without an explicit projection the ORM's default
 * return-row decode chokes on relation fields (`Cannot read properties of
 * undefined (reading 'codecId')` — no scalar codec for e.g. `User.boards`),
 * matching every write example in prisma-next's own demo app, which always
 * calls `.select(...)` before `.create()`/`.update()` too.
 */
function ormRootFor(db: Awaited<ReturnType<typeof getPostgres>>, model: string): OrmRoot {
  return (db.orm.public as unknown as Record<string, OrmRoot>)[model]!;
}

/** The primary-key field name for a model, per the shared domain contract. */
export function getKeyField(model: string): string {
  return sqlGetKeyField(serverContract, model);
}

/**
 * Walks one of `OwnershipCheck["scoped"].paths` (relation-name chains, e.g.
 * `["board", "user"]`) via the real Postgres tables. Sequential single-key
 * lookups, not a nested relation-filter query: simpler to get right against
 * the real ORM client's relation-filter API without deep-diving its
 * expression builder, and the chains here are always 1-2 hops.
 *
 * Returns the resolved root's own key, or null if the chain is broken
 * (missing FK, deleted parent).
 */
async function resolveRootKeyViaPath(
  db: Awaited<ReturnType<typeof getPostgres>>,
  startModel: string,
  startRow: Record<string, unknown>,
  path: readonly string[],
  rootKeyField: string
): Promise<unknown> {
  const models = domainModelsAtDefaultNamespace(serverContract.domain);

  let currentModel = startModel;
  let currentRow: Record<string, unknown> | null = startRow;

  for (const relationName of path) {
    if (!currentRow) return null;
    const model = models[currentModel];
    const relation = model?.relations[relationName];
    if (!relation || !("on" in relation)) return null; // ContractEmbedRelation has no FK to walk
    const localField = relation.on.localFields[0];
    if (!localField) return null;

    const fkValue: unknown = currentRow[localField];
    if (fkValue == null) return null;

    const targetModel = relation.to.model;
    const targetKeyField = sqlGetKeyField(serverContract, targetModel);
    currentRow = (await ormRootFor(db, targetModel).first({ [targetKeyField]: fkValue })) ?? null;
    currentModel = targetModel;
  }

  return currentRow ? currentRow[rootKeyField] : null;
}

// ── OwnershipCheck execution ─────────────────────────────────────────────────

/**
 * Resolves an `OwnershipCheck` to a plain boolean, given the record's
 * current row (`null` for `"root"` checks, which don't need one). Unifies
 * what used to be two near-identical authorization loops in push and pull.
 */
async function checkAuthorization(
  db: Awaited<ReturnType<typeof getPostgres>>,
  model: string,
  check: OwnershipCheck,
  startRow: Record<string, unknown> | null
): Promise<boolean> {
  if (check.kind === "unknown-model") return false;
  if (check.kind === "root") return check.authorized;
  if (!startRow) return false; // record already gone / never existed — nothing to authorize

  for (const path of check.paths) {
    const rootKey = await resolveRootKeyViaPath(db, model, startRow, path, check.rootKeyField);
    if (rootKey === check.scopeKey) return true;
  }
  return false;
}

// ── Push ──────────────────────────────────────────────────────────────────────

export interface PushEventBody {
  readonly id: string;
  readonly entityType: string;
  readonly operation: string;
  readonly payload: unknown;
}

export interface PushResultBody {
  readonly id: string;
  readonly success: boolean;
  readonly error?: string;
  readonly retryable?: boolean;
}

/** Extracts the shape `sync-server`'s `validatePush` reads `payload[keyField]` from, per operation kind (sync-executor.ts's `outboxPayload`). */
export function toSyncPushPayload(operation: string, payload: unknown, keyField: string): Record<string, unknown> {
  if (operation === "create") return payload as Record<string, unknown>;
  if (operation === "update") return (payload as { where: Record<string, unknown> }).where;
  if (operation === "delete") return { [keyField]: (payload as { key: unknown }).key };
  throw new Error(`Unsupported operation "${operation}"`);
}

/** `createdAt` is the only DateTime field this app's sync payloads ever carry, over the wire as an ISO string. */
function decodeDates(payload: Record<string, unknown>): Record<string, unknown> {
  if (typeof payload["createdAt"] === "string") {
    return { ...payload, createdAt: new Date(payload["createdAt"] as string) };
  }
  return payload;
}

/**
 * Authorizes, then applies, one outbox event: writes the model row + a
 * stamped `Changelog` row, atomically. Idempotent on `outboxEventId`.
 *
 * Authorization runs *inside* the same transaction as the write, right
 * before it — not before `db.transaction()` opens — so the row(s) it reads
 * (the record itself, and every hop `checkAuthorization` walks) are locked
 * against concurrent reassignment for the rest of the transaction. Checking
 * outside the transaction would leave a window where e.g. a `Board`'s
 * `userId` could be reassigned between the check and the write it authorized.
 */
export async function applyPushEvent(
  db: Awaited<ReturnType<typeof getPostgres>>,
  event: PushEventBody,
  model: string,
  check: OwnershipCheck,
  scopeKey: string
): Promise<PushResultBody> {
  if (check.kind === "unknown-model") {
    return { id: event.id, success: false, error: "Unknown model", retryable: false };
  }

  try {
    return await db.transaction(async (tx) => {
      const txDb = { orm: tx.orm } as unknown as Awaited<ReturnType<typeof getPostgres>>;
      const changelogRoot = ormRootFor(txDb, "Changelog");
      const alreadyApplied = await changelogRoot.first({ outboxEventId: event.id });
      if (alreadyApplied) return { id: event.id, success: true };

      const keyField = getKeyField(model);
      const startRow: Record<string, unknown> | null =
        event.operation === "create"
          ? (event.payload as Record<string, unknown>)
          : await ormRootFor(txDb, model).first({ [keyField]: check.key });

      if (!(await checkAuthorization(txDb, model, check, startRow))) {
        return { id: event.id, success: false, error: "SCOPE_VIOLATION", retryable: false };
      }

      const root = ormRootFor(txDb, model);
      if (event.operation === "create") {
        await root.select(keyField).create(decodeDates(event.payload as Record<string, unknown>));
      } else if (event.operation === "update") {
        const { where, patch } = event.payload as { where: Record<string, unknown>; patch: Record<string, unknown> };
        await root.select(keyField).where(where).update(decodeDates(patch));
      } else {
        await root.where({ [keyField]: (event.payload as { key: unknown }).key }).delete();
      }

      await changelogRoot.select("id").create({
        model,
        keyPath: check.key,
        operation: event.operation,
        scopeKey,
        outboxEventId: event.id,
      });

      return { id: event.id, success: true };
    });
  } catch (err) {
    // Log the real error server-side only — it can carry DB-internal detail
    // (constraint names, SQL fragments) that shouldn't reach the client.
    console.error(`push apply failed for event ${event.id}`, err);
    return {
      id: event.id,
      success: false,
      error: `Failed to apply event ${event.id}`,
      retryable: true,
    };
  }
}

// ── Pull ──────────────────────────────────────────────────────────────────────

/**
 * Authorizes a pulled changelog row, then re-fetches the record's
 * *current* state if allowed. `null` for unauthorized/deleted —
 * sync-extension-idb's `applyPull` treats a null record as a local delete.
 */
export async function resolvePullRecord(
  db: Awaited<ReturnType<typeof getPostgres>>,
  model: string,
  check: OwnershipCheck,
  keyPath: unknown,
  operation: "create" | "update" | "delete"
): Promise<Record<string, unknown> | null> {
  if (check.kind === "unknown-model") return null;

  const startRow =
    check.kind === "scoped" ? await ormRootFor(db, model).first({ [getKeyField(model)]: check.key }) : null;

  const authorized = await checkAuthorization(db, model, check, startRow);
  if (!authorized || operation === "delete") return null;

  return ormRootFor(db, model).first({ [getKeyField(model)]: keyPath });
}
