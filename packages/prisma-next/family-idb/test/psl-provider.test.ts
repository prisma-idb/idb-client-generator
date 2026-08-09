import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ContractSourceContext } from "@prisma-next/config/config-types";
import type { IdbStorage } from "@prisma-next-idb/target-idb/pack";
import { prismaIdbContract } from "../src/core/psl-provider";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "idb-psl-provider-test-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function load(schemaFileName: string, schema: string, options?: Parameters<typeof prismaIdbContract>[1]) {
  const schemaPath = join(dir, schemaFileName);
  await writeFile(schemaPath, schema, "utf-8");
  const config = prismaIdbContract(schemaPath, options);
  const context = { resolvedInputs: [schemaPath] } as unknown as ContractSourceContext;
  return config.source.load(context);
}

describe("prismaIdbContract", () => {
  it("parses a schema file into a contract", async () => {
    const result = await load(
      "schema.prisma",
      `
        model User {
          id   String @id
          name String
        }
      `
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.value.storage as IdbStorage).stores).toHaveProperty("user");
  });

  describe("injectSchemaText", () => {
    it("runs on the raw schema text before parsing, so an injected model reaches the contract", async () => {
      const result = await load(
        "schema.prisma",
        `
          model User {
            id String @id
          }
        `,
        { injectSchemaText: (schema) => `${schema}\nmodel Injected {\n  id String @id\n}\n` }
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const stores = (result.value.storage as IdbStorage).stores;
      expect(stores).toHaveProperty("user");
      expect(stores).toHaveProperty("injected");
    });

    it("folds the injected model into storageHash — same schema, different hash with vs without injection", async () => {
      const withoutInjection = await load(
        "a.prisma",
        `
          model User {
            id String @id
          }
        `
      );
      const withInjection = await load(
        "b.prisma",
        `
          model User {
            id String @id
          }
        `,
        { injectSchemaText: (schema) => `${schema}\nmodel Injected {\n  id String @id\n}\n` }
      );
      expect(withoutInjection.ok).toBe(true);
      expect(withInjection.ok).toBe(true);
      if (!withoutInjection.ok || !withInjection.ok) return;
      expect((withInjection.value.storage as IdbStorage).storageHash).not.toBe(
        (withoutInjection.value.storage as IdbStorage).storageHash
      );
    });

    it("surfaces a diagnostic if the injected text is invalid PSL, same as a hand-authored error", async () => {
      const result = await load(
        "schema.prisma",
        `
          model User {
            id String @id
          }
        `,
        { injectSchemaText: (schema) => `${schema}\nmodel Broken {\n  id NotAScalar @id\n}\n` }
      );
      expect(result.ok).toBe(false);
    });
  });
});
