import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { injectChangelogModelSql, prepareSqlSchemaWithSync, writeSqlSchemaWithSync } from "../src/exports/schema";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sync-server-schema-test-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("injectChangelogModelSql", () => {
  it("appends a real enum and a DB-generated id", () => {
    const withChangelog = injectChangelogModelSql("model User {\n  id String @id\n}\n");
    expect(withChangelog).toContain("enum ChangeOperation {");
    expect(withChangelog).toContain("@default(autoincrement())");
    expect(withChangelog).toContain("model User {");
  });

  it("stores keyPath as String, not Json", () => {
    const withChangelog = injectChangelogModelSql("");
    expect(withChangelog).toMatch(/keyPath\s+String/);
  });

  it("emits no @@type codec pragma on the enum — inferred by the target's own config instead", () => {
    const withChangelog = injectChangelogModelSql("");
    expect(withChangelog).not.toContain("@@type");
  });
});

describe("prepareSqlSchemaWithSync", () => {
  it("strips @idb.exclude and appends the SQL-flavored Changelog in one call", () => {
    const result = prepareSqlSchemaWithSync(`
      model User {
        id           String @id
        passwordHash String @idb.exclude
      }
      model AuditLog {
        id String @id
        @@idb.exclude
      }
    `);
    expect(result).not.toContain("@idb.exclude");
    expect(result).toContain("passwordHash");
    expect(result).toContain("model AuditLog");
    expect(result).toContain("enum ChangeOperation {");
  });
});

describe("writeSqlSchemaWithSync", () => {
  it("reads the source, prepares it, writes the result, and returns the generated path", () => {
    const sourcePath = join(dir, "schema.prisma");
    const generatedPath = join(dir, "schema.postgres.generated.prisma");
    writeFileSync(sourcePath, "model User {\n  id String @id\n}\n", "utf-8");

    const returned = writeSqlSchemaWithSync(sourcePath, generatedPath);

    expect(returned).toBe(generatedPath);
    const written = readFileSync(generatedPath, "utf-8");
    expect(written).toContain("model User {");
    expect(written).toContain("enum ChangeOperation {");
    expect(written).toContain("AUTO-GENERATED");
  });
});
