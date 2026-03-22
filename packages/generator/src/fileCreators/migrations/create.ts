import fs from "fs";
import path from "path";
import type { DMMF } from "@prisma/generator-helper";
import { writeCodeFile } from "../../helpers/fileWriting";
import {
  type Snapshot,
  listMigrationFolders,
  extractSnapshot,
  computeSchemaHash,
  computeDiff,
} from "../../helpers/migrations";
import { createDmmfSnapshotFile } from "./createDmmfSnapshot";
import { createMigrationFunctionFile } from "./createMigrationFunction";

export interface MigrationGenerationResult {
  currentVersion: number;
  schemaHash: string;
  migrationFolderNames: string[];
}

/**
 * Orchestrate the generation of all migration-related files.
 *
 * For each migration folder in prisma/migrations/:
 *   - Always write dmmf.ts (overwrite) + snapshot.json (machine-readable)
 *   - If migration.ts does not exist, generate it (write-once)
 *
 * Returns the current version number and schema hash.
 */
export async function generateMigrations(
  schemaPath: string,
  outputPath: string,
  filteredModels: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[],
  outboxSync: boolean,
  outboxModelName: string,
  versionMetaModelName: string
): Promise<MigrationGenerationResult> {
  const migrationFolderNames = listMigrationFolders(schemaPath);
  const currentVersion = migrationFolderNames.length;

  // The current schema's structural snapshot
  const currentSnapshot = extractSnapshot(filteredModels, currentVersion, enums);
  const schemaHash = computeSchemaHash(currentSnapshot);

  if (currentVersion === 0) {
    return { currentVersion, schemaHash, migrationFolderNames };
  }

  // Load existing snapshots from previous generate runs.
  // Any migration without an existing snapshot gets the current DMMF.
  // This means for fresh setups, V1 creates everything and later Vs are no-ops.
  const snapshots: Snapshot[] = [];
  for (let i = 0; i < migrationFolderNames.length; i++) {
    const folderName = migrationFolderNames[i];
    const snapshotJsonPath = path.join(outputPath, "client", "migrations", folderName, "snapshot.json");

    if (fs.existsSync(snapshotJsonPath)) {
      const json = fs.readFileSync(snapshotJsonPath, "utf-8");
      snapshots.push(JSON.parse(json) as Snapshot);
    } else {
      // No existing snapshot — use current DMMF with this version number
      snapshots.push({ ...currentSnapshot, version: i + 1 });
    }
  }

  // Generate files for each migration
  for (let i = 0; i < migrationFolderNames.length; i++) {
    const folderName = migrationFolderNames[i];
    const version = i + 1;
    const snapshot = snapshots[i];
    const prevSnapshot = i > 0 ? snapshots[i - 1] : null;

    const migrationDir = `client/migrations/${folderName}`;

    // Always write snapshot.json (machine-readable, for future diffs)
    const snapshotJsonPath = path.join(outputPath, migrationDir, "snapshot.json");
    fs.mkdirSync(path.dirname(snapshotJsonPath), { recursive: true });
    fs.writeFileSync(snapshotJsonPath, JSON.stringify(snapshot, null, 2));

    // Always write dmmf.ts (overwrite)
    await writeCodeFile(`${migrationDir}/dmmf.ts`, outputPath, (writer) => {
      createDmmfSnapshotFile(writer, snapshot);
    });

    // Write migration.ts only if it does NOT exist (write-once contract)
    const migrationTsPath = path.join(outputPath, migrationDir, "migration.ts");
    if (!fs.existsSync(migrationTsPath)) {
      const diff = computeDiff(prevSnapshot, snapshot);
      const isFirstMigration = version === 1;

      // Include _idb_meta store creation in the first migration
      const includeMetaStore = isFirstMigration;

      // If outboxSync, add OutboxEvent and VersionMeta stores to first migration
      if (isFirstMigration && outboxSync) {
        diff.ops.push(
          { type: "createObjectStore", name: outboxModelName, keyPath: ["id"] },
          { type: "createObjectStore", name: versionMetaModelName, keyPath: ["model", "key"] }
        );
      }

      await writeCodeFile(`${migrationDir}/migration.ts`, outputPath, (writer) => {
        createMigrationFunctionFile(writer, diff, version, includeMetaStore);
      });
    }
  }

  return { currentVersion, schemaHash, migrationFolderNames };
}
