import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ContractSourceContext } from "@prisma-next/config/config-types";
import type { IdbStorage } from "@prisma-next-idb/target-idb/pack";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { injectChangelogModel, prismaIdbContractWithSync } from "../src/exports/schema";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sync-server-schema-test-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function load(schema: string) {
  const schemaPath = join(dir, "schema.prisma");
  await writeFile(schemaPath, schema, "utf-8");
  const config = prismaIdbContractWithSync(schemaPath);
  const context = { resolvedInputs: [schemaPath] } as unknown as ContractSourceContext;
  return config.source.load(context);
}

describe("prismaIdbContractWithSync", () => {
  it("adds a Changelog store alongside the user's own models, with no hand-authoring", async () => {
    const result = await load(`
      model User {
        id   String @id
        name String
      }
    `);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const storage = result.value.storage as IdbStorage;
    expect(storage.stores).toHaveProperty("user");
    expect(storage.stores).toHaveProperty("changelog");
    expect(storage.stores["changelog"]).toMatchObject({ keyPath: "id" });
  });

  it("indexes Changelog by model for scoped lookups", async () => {
    const result = await load(`
      model User {
        id String @id
      }
    `);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const storage = result.value.storage as IdbStorage;
    expect(storage.stores["changelog"]?.indexes).toHaveProperty("model");
  });

  it("gives Changelog exactly the six fields the old generator required", async () => {
    const result = await load(`
      model User {
        id String @id
      }
    `);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const domainModels = result.value.domain.namespaces[Object.keys(result.value.domain.namespaces)[0]!]!.models;
    const changelog = domainModels["Changelog"] as unknown as { fields: Record<string, unknown> };
    expect(Object.keys(changelog.fields).sort()).toEqual(
      ["id", "keyPath", "model", "operation", "outboxEventId", "scopeKey"].sort()
    );
  });

  it("still fails on a genuinely broken user schema — injection doesn't mask real errors", async () => {
    const result = await load(`
      model User {
        id   NotAScalar @id
      }
    `);
    expect(result.ok).toBe(false);
  });
});

describe("injectChangelogModel", () => {
  it("is usable standalone, independent of family-idb's own PSL loader", () => {
    const withChangelog = injectChangelogModel("model User {\n  id String @id\n}\n");
    expect(withChangelog).toContain("model Changelog {");
    expect(withChangelog).toContain("model User {");
  });

  it("emits only vanilla Prisma syntax — no @idb.*-namespaced attributes", () => {
    const withChangelog = injectChangelogModel("");
    expect(withChangelog).not.toContain("@idb.");
  });
});
