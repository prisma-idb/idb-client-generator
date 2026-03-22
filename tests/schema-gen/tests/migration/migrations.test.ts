/// <reference types="node" />

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execa } from "execa";
import fs from "fs/promises";
import path from "path";

const schemasDir = path.resolve("./tests/migration/schemas");

// Working directory: a temp area where we place schema.prisma, run prisma migrate, and generate
const workDir = path.resolve("./tests/migration/_work");
const schemaFile = path.join(workDir, "schema.prisma");
const dbFile = path.join(workDir, "dev.db");
const prismaConfigFile = path.join(workDir, "prisma.config.ts");
const generatedDir = path.join(workDir, "generated");
const idbClientDir = path.join(generatedDir, "prisma-idb", "client");
const idbMigrationsDir = path.join(idbClientDir, "migrations");

const DATABASE_URL = `file:${dbFile}`;

async function setupWorkDir() {
  await fs.mkdir(workDir, { recursive: true });

  // Create prisma.config.ts for Prisma 7 (datasource URL must be in config, not schema)
  const configContent = `
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "./schema.prisma",
  migrations: { path: "./migrations" },
  datasource: { url: "${DATABASE_URL}" },
});
`;
  await fs.writeFile(prismaConfigFile, configContent);
}

async function copySchema(version: string) {
  const content = await fs.readFile(path.join(schemasDir, version), "utf8");
  await fs.writeFile(schemaFile, content);
}

async function migrate(name: string) {
  await execa("pnpm", ["prisma", "migrate", "dev", "--name", name, "--config", prismaConfigFile]);
  await generate();
}

async function generate() {
  await execa("pnpm", ["prisma", "generate", "--config", prismaConfigFile]);
}

async function readGenerated(relativePath: string): Promise<string> {
  return fs.readFile(path.join(idbClientDir, relativePath), "utf8");
}

async function fileExists(relativePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(idbClientDir, relativePath));
    return true;
  } catch {
    return false;
  }
}

/**
 * List migration folder names created by prisma migrate dev.
 */
async function listMigrationFolders(): Promise<string[]> {
  const migrationsDir = path.join(workDir, "migrations");
  try {
    const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

describe("migration generation", () => {
  beforeAll(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
    await setupWorkDir();
  });

  afterAll(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it("v0: no migration folders => no migration files generated", async () => {
    await copySchema("v0-base.prisma");
    await generate();

    // No migrations dir in output since there are no prisma migration folders
    const exists = await fileExists("migrations");
    expect(exists).toBe(false);

    // Should still have the hash file
    const hashFile = await readGenerated("idb-schema-hash.ts");
    expect(hashFile).toContain("IDB_SCHEMA_HASH");

    // Client should use IDB_VERSION = 1 (legacy path, no CURRENT_VERSION)
    const clientFile = await readGenerated("prisma-idb-client.ts");
    expect(clientFile).toContain("IDB_VERSION = 1");
    expect(clientFile).not.toContain("CURRENT_VERSION");
  }, 60000);

  it("v0 + prisma migrate => generates initial migration with createObjectStore", async () => {
    await migrate("init");

    const folders = await listMigrationFolders();
    expect(folders).toHaveLength(1);
    const initFolder = folders[0];

    // Check migration.ts was generated
    const migrationTs = await readGenerated(`migrations/${initFolder}/migration.ts`);
    expect(migrationTs).toContain('db.createObjectStore("_idb_meta")');
    expect(migrationTs).toContain('db.createObjectStore("User"');
    // OutboxEvent and VersionMeta are added since outboxSync is enabled
    expect(migrationTs).toContain('db.createObjectStore("OutboxEvent"');
    expect(migrationTs).toContain('db.createObjectStore("VersionMeta"');

    // Check snapshot.json was generated
    const snapshotJson = JSON.parse(await readGenerated(`migrations/${initFolder}/snapshot.json`));
    expect(snapshotJson.version).toBe(1);
    expect(snapshotJson.models).toHaveLength(1);
    expect(snapshotJson.models[0].name).toBe("User");

    // Check dmmf.ts was generated
    const dmmfTs = await readGenerated(`migrations/${initFolder}/dmmf.ts`);
    expect(dmmfTs).toContain("as const");
    expect(dmmfTs).toContain('"User"');

    // Client should now use CURRENT_VERSION = 1
    const clientFile = await readGenerated("prisma-idb-client.ts");
    expect(clientFile).toContain("CURRENT_VERSION = 1");
    expect(clientFile).toContain("migrateV1");
  }, 60000);

  it("v1 (add email field) + prisma migrate => generates addField migration", async () => {
    await copySchema("v1-new-field.prisma");
    await migrate("add_email");

    const folders = await listMigrationFolders();
    expect(folders).toHaveLength(2);
    const secondFolder = folders[1];

    // First migration should NOT be overwritten (write-once)
    const firstMigration = await readGenerated(`migrations/${folders[0]}/migration.ts`);
    expect(firstMigration).toContain('db.createObjectStore("User"');

    // Second migration should reference the new email field
    const secondMigration = await readGenerated(`migrations/${secondFolder}/migration.ts`);
    expect(secondMigration).toContain("email");
    expect(secondMigration).toContain("new field");

    // Snapshot should show version 2 with the email field
    const snapshotJson = JSON.parse(await readGenerated(`migrations/${secondFolder}/snapshot.json`));
    expect(snapshotJson.version).toBe(2);
    expect(snapshotJson.models[0].name).toBe("User");
    const userFields = snapshotJson.models[0].fields.map((f: { name: string }) => f.name);
    expect(userFields).toContain("email");

    // Client should now reference CURRENT_VERSION = 2
    const clientFile = await readGenerated("prisma-idb-client.ts");
    expect(clientFile).toContain("CURRENT_VERSION = 2");
    expect(clientFile).toContain("migrateV1");
    expect(clientFile).toContain("migrateV2");
  }, 60000);

  it("v2 (add Todo model) + prisma migrate => generates createObjectStore migration", async () => {
    await copySchema("v2-new-model.prisma");
    await migrate("add_todo");

    const folders = await listMigrationFolders();
    expect(folders).toHaveLength(3);
    const thirdFolder = folders[2];

    // Previous migrations untouched
    const firstMigration = await readGenerated(`migrations/${folders[0]}/migration.ts`);
    expect(firstMigration).toContain('db.createObjectStore("User"');
    const secondMigration = await readGenerated(`migrations/${folders[1]}/migration.ts`);
    expect(secondMigration).toContain("email");

    // Third migration should create the Todo object store
    const thirdMigration = await readGenerated(`migrations/${thirdFolder}/migration.ts`);
    expect(thirdMigration).toContain('db.createObjectStore("Todo"');

    // Snapshot should show version 3 with both User and Todo
    const snapshotJson = JSON.parse(await readGenerated(`migrations/${thirdFolder}/snapshot.json`));
    expect(snapshotJson.version).toBe(3);
    const modelNames = snapshotJson.models.map((m: { name: string }) => m.name);
    expect(modelNames).toContain("User");
    expect(modelNames).toContain("Todo");

    // Client should now reference CURRENT_VERSION = 3
    const clientFile = await readGenerated("prisma-idb-client.ts");
    expect(clientFile).toContain("CURRENT_VERSION = 3");
    expect(clientFile).toContain("migrateV1");
    expect(clientFile).toContain("migrateV2");
    expect(clientFile).toContain("migrateV3");

    // The upgrade switch should have fallthrough cases
    expect(clientFile).toContain("case 0:");
    expect(clientFile).toContain("case 1:");
    expect(clientFile).toContain("case 2:");
  }, 60000);

  it("re-running generate does not overwrite existing migration.ts files", async () => {
    const folders = await listMigrationFolders();
    const initFolder = folders[0];

    // Add a marker comment to the first migration to prove it's not overwritten
    const migrationPath = path.join(idbMigrationsDir, initFolder, "migration.ts");
    const beforeContent = await fs.readFile(migrationPath, "utf8");
    await fs.writeFile(migrationPath, beforeContent + "\n// user edit marker\n");

    // Regenerate
    await generate();

    // The user edit should still be there (write-once contract)
    const afterContent = await readGenerated(`migrations/${initFolder}/migration.ts`);
    expect(afterContent).toContain("// user edit marker");

    // But dmmf.ts and snapshot.json should be refreshed (always-overwrite)
    const dmmfTs = await readGenerated(`migrations/${initFolder}/dmmf.ts`);
    expect(dmmfTs).toContain("as const");
  }, 60000);

  it("schema hash changes across versions", async () => {
    const hashFile = await readGenerated("idb-schema-hash.ts");
    const hashMatch = hashFile.match(/IDB_SCHEMA_HASH = "([^"]+)"/);
    expect(hashMatch).toBeTruthy();
    expect(hashMatch![1].length).toBeGreaterThan(0);
  }, 60000);
});
