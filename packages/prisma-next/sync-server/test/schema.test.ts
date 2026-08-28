import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ContractSourceContext } from "@prisma/orm-framework/config/config-types";
import postgresPackRef from "@prisma/orm-postgres/target/pack";
import { postgresCreateNamespace } from "@prisma/orm-postgres/target/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  injectChangelogModelSql,
  prepareSqlSchemaWithSync,
  sqlContractWithSync,
  writeSqlSchemaWithSync,
} from "../src/exports/schema";

const postgresContractOptions = {
  target: postgresPackRef,
  createNamespace: postgresCreateNamespace,
};

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

describe("sqlContractWithSync", () => {
  it("derives inputs/output the same way prismaContract does, without touching disk", () => {
    const schemaPath = join(dir, "schema.prisma");
    const config = sqlContractWithSync(schemaPath, postgresContractOptions);

    expect(config.source.format).toBe("psl");
    expect(config.source.inputs).toEqual([schemaPath]);
    expect(config.output).toBe(join(dir, "contract.json"));
  });

  it("respects an explicit output override", () => {
    const schemaPath = join(dir, "schema.prisma");
    const config = sqlContractWithSync(schemaPath, { ...postgresContractOptions, output: join(dir, "out.json") });

    expect(config.output).toBe(join(dir, "out.json"));
  });

  it("surfaces a read failure as a NotOk PSL_SCHEMA_READ_FAILED diagnostic, never a thrown error", async () => {
    const schemaPath = join(dir, "schema.prisma");
    const missingPath = join(dir, "does-not-exist.prisma");
    const config = sqlContractWithSync(schemaPath, postgresContractOptions);

    // The read failure short-circuits before any other context field is
    // read, so only `resolvedInputs` needs a real value here.
    const context = { resolvedInputs: [missingPath] } as unknown as ContractSourceContext;
    const result = await config.source.load(context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.diagnostics).toHaveLength(1);
      expect(result.failure.diagnostics[0]?.code).toBe("PSL_SCHEMA_READ_FAILED");
    }
  });
});
