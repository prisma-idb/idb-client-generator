import { describe, it, expect } from "vitest";
import { execa } from "execa";
import fs from "fs/promises";
import path from "path";

describe("schema projection", () => {
  it("generates local schema for valid input", async () => {
    const schemaPath = path.resolve("./schemas/valid/user-board-todo.prisma");

    await execa("pnpm", ["prisma", "generate", "--schema", schemaPath]);

    const projected = await fs.readFile("./generated/prisma-idb/client/scoped-schema.prisma", "utf8");

    expect(projected).toMatchSnapshot();
  }, 10000);

  it("fails on missing root model", async () => {
    const schemaPath = path.resolve("./schemas/invalid/no-root-model-with-sync.prisma");

    await expect(execa("pnpm", ["prisma", "generate", "--schema", schemaPath])).rejects.toThrow(
      `@prisma-idb/idb-client-generator: "rootModel" must be specified in the generator config when "outboxSync" is enabled.`
    );
  });

  it("fails on self-ownership cycle", async () => {
    const schemaPath = path.resolve("./schemas/invalid/ownership-cycle-self.prisma");

    await expect(execa("pnpm", ["prisma", "generate", "--schema", schemaPath])).rejects.toThrow(
      `Cycle detected in the model relationships involving model "Node".`
    );
  });

  it("fails on ambiguous ownership cycle", async () => {
    const schemaPath = path.resolve("./schemas/invalid/ownership-cycle-ambiguous.prisma");

    await expect(execa("pnpm", ["prisma", "generate", "--schema", schemaPath])).rejects.toThrow(
      `Cycle detected in the model relationships involving model "Todo".`
    );
  });
});
