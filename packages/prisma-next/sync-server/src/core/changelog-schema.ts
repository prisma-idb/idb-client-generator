/**
 * Synthetic `Changelog` model, appended to the raw PSL text of a server
 * contract (never the client one) so a consumer never hand-authors it —
 * the old generator required an exact 6-field model + a matching enum and
 * threw one of a dozen validation errors if either drifted. `operation` is
 * a plain `String`, not a PSL enum: `family-idb`'s PSL interpreter has no
 * enum support at all (`SCALAR_TO_CODEC_ID` has no enum entry), and the
 * rest of this sync stack already treats `SyncPushEvent.operation`/
 * `SyncPullLogEntry` shapes as a `"create" | "update" | "delete"` string
 * union, never a Prisma enum — so this isn't a downgrade, just the type
 * this repo already uses everywhere else. `@@index([model])` is
 * single-field because IDB compound indexes aren't supported yet
 * (`IDB_COMPOUND_INDEX_UNSUPPORTED`) — the old generator's
 * `@@index([model, id])` doesn't translate; `id` is already the primary
 * key and thus already indexed for cursor scans, so a single index on
 * `model` covers the rest.
 */
const CHANGELOG_MODEL_PSL = `
model Changelog {
  id            String @id
  model         String
  keyPath       Json
  operation     String
  scopeKey      String
  outboxEventId String @unique

  @@index([model])
}
`;

/** Appends the synthetic `Changelog` model to raw PSL schema text. */
export function injectChangelogModel(schema: string): string {
  return `${schema}\n${CHANGELOG_MODEL_PSL}`;
}
