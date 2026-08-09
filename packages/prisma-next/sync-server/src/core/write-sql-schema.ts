import { readFileSync, writeFileSync } from "node:fs";
import { prepareSqlSchemaWithSync } from "./changelog-schema";

/**
 * Reads `sourceSchemaPath` (the schema authored for `family-idb`), runs it
 * through {@link prepareSqlSchemaWithSync}, and writes the result to
 * `generatedSchemaPath` with an auto-generated header — the file I/O a SQL
 * config needs around the pure text transform, so a consuming app's own
 * `prisma-next.config.postgres.ts` doesn't have to hand-roll `readFileSync`/
 * `writeFileSync`/comment-building itself. Returns `generatedSchemaPath`
 * unchanged, so it can be used inline as the `contract:` value.
 *
 * Call this at config-load time (synchronously, same as the read/write it
 * wraps) — see the package README for the full `defineConfig` example.
 */
export function writeSqlSchemaWithSync(sourceSchemaPath: string, generatedSchemaPath: string): string {
  const source = readFileSync(sourceSchemaPath, "utf-8");
  const prepared = prepareSqlSchemaWithSync(source);
  writeFileSync(
    generatedSchemaPath,
    `// AUTO-GENERATED — do not edit. Regenerated from ${sourceSchemaPath} every time this\n` +
      `// config loads, via @prisma-next-idb/sync-server/schema's writeSqlSchemaWithSync.\n\n${prepared}`
  );
  return generatedSchemaPath;
}
