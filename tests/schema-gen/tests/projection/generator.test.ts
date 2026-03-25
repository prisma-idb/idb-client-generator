/// <reference types="node" />

import { describe, it, expect } from "vitest";
import { execa } from "execa";
import fs from "fs/promises";
import path from "path";

const schemasDir = path.resolve("./tests/projection/schemas");

describe("schema projection", () => {
  it("generates local schema for valid input", async () => {
    const schemaPath = path.join(schemasDir, "valid", "user-board-todo.prisma");

    await execa("pnpm", ["prisma", "generate", "--schema", schemaPath]);

    const projected = await fs.readFile("./tests/projection/generated/prisma-idb/client/scoped-schema.prisma", "utf8");

    expect(projected).toMatchSnapshot();
  }, 20000);

  it("generates correct batch-processor for optional relations in ownership path", async () => {
    const schemaPath = path.join(schemasDir, "valid", "user-meal-foodentry-optional.prisma");

    await execa("pnpm", ["prisma", "generate", "--schema", schemaPath]);

    const batchProcessor = await fs.readFile("./tests/projection/generated/prisma-idb/server/batch-processor.ts", "utf8");

    // Verify optional chaining is placed after the optional relation field, before the next access
    expect(batchProcessor).toContain("record.meal?.user.id !== scopeKey");
    // Verify null FK guard throws SCOPE_VIOLATION instead of skipping the ownership check
    expect(batchProcessor).toContain("if (data.mealId == null)");
    expect(batchProcessor).not.toContain("?? undefined");

    expect(batchProcessor).toMatchSnapshot();
  }, 20000);

  it("fails on missing root model", async () => {
    const schemaPath = path.join(schemasDir, "invalid", "no-root-model-with-sync.prisma");

    await expect(execa("pnpm", ["prisma", "generate", "--schema", schemaPath])).rejects.toThrow(
      `@prisma-idb/idb-client-generator: "rootModel" must be specified in the generator config when "outboxSync" is enabled.`
    );
  });

  it("fails on self-ownership cycle", async () => {
    const schemaPath = path.join(schemasDir, "invalid", "ownership-cycle-self.prisma");

    await expect(execa("pnpm", ["prisma", "generate", "--schema", schemaPath])).rejects.toThrow(
      `Cycle detected in the model relationships involving model "Node".`
    );
  });

  it("fails on ambiguous ownership cycle", async () => {
    const schemaPath = path.join(schemasDir, "invalid", "ownership-cycle-ambiguous.prisma");

    await expect(execa("pnpm", ["prisma", "generate", "--schema", schemaPath])).rejects.toThrow(
      `Cycle detected in the model relationships involving model "Todo".`
    );
  });

  it("fails on autoincrement id", async () => {
    const schemaPath = path.join(schemasDir, "invalid", "autoincrement-id.prisma");

    await expect(execa("pnpm", ["prisma", "generate", "--schema", schemaPath])).rejects.toThrow(
      `Model "TodoAutoincrementId" has @id field "id" with invalid default "autoincrement". Required: Use random defaults like uuid() or cuid() for all models (except rootModel) included in sync.`
    );
  });

  it("fails on missing Changelog model", async () => {
    const schemaPath = path.join(schemasDir, "invalid", "missing-changelog.prisma");

    await expect(execa("pnpm", ["prisma", "generate", "--schema", schemaPath])).rejects.toThrow(
      `@prisma-idb/idb-client-generator: A "Changelog" model is required when "outboxSync" is enabled.`
    );
  });

  it("fails on extra ChangeOperation enum value", async () => {
    const schemaPath = path.join(schemasDir, "invalid", "extra-change-operation-enum-value.prisma");

    await expect(execa("pnpm", ["prisma", "generate", "--schema", schemaPath])).rejects.toThrow(
      `@prisma-idb/idb-client-generator: ChangeOperation enum must have exactly 3 values (create, update, delete), but has 4.`
    );
  });

  it("fails on invalid ChangeOperation enum value", async () => {
    const schemaPath = path.join(schemasDir, "invalid", "invalid-change-operation-enum-value.prisma");

    await expect(execa("pnpm", ["prisma", "generate", "--schema", schemaPath])).rejects.toThrow(
      `@prisma-idb/idb-client-generator: ChangeOperation enum has invalid value "read". Only valid values are: create, update, delete.`
    );
  });

  it("fails on extra Changelog field", async () => {
    const schemaPath = path.join(schemasDir, "invalid", "extra-changelog-field.prisma");

    await expect(execa("pnpm", ["prisma", "generate", "--schema", schemaPath])).rejects.toThrow(
      `@prisma-idb/idb-client-generator: Changelog model must have exactly 6 fields, but has 7.`
    );
  });

  it("fails on invalid Changelog operation field type", async () => {
    const schemaPath = path.join(schemasDir, "invalid", "invalid-changelog-operation-field-type.prisma");

    await expect(execa("pnpm", ["prisma", "generate", "--schema", schemaPath])).rejects.toThrow(
      `@prisma-idb/idb-client-generator: Changelog.operation must be of type ChangeOperation, got String.`
    );
  });

  it("fails on wrong Changelog id default", async () => {
    const schemaPath = path.join(schemasDir, "invalid", "wrong-changelog-id-default.prisma");

    await expect(execa("pnpm", ["prisma", "generate", "--schema", schemaPath])).rejects.toThrow(
      `@prisma-idb/idb-client-generator: Changelog.id @default must be uuid(7), got uuid.`
    );
  });

  it("fails when Changelog model is manually included", async () => {
    const schemaPath = path.join(schemasDir, "invalid", "changelog-manually-included.prisma");

    await expect(execa("pnpm", ["prisma", "generate", "--schema", schemaPath])).rejects.toThrow(
      `@prisma-idb/idb-client-generator: "Changelog" model is automatically excluded and cannot be manually included. It is reserved for internal sync infrastructure.`
    );
  });
});
