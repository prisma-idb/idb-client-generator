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

  it("deduplicates shared prefix composite index branches", async () => {
    const schemaPath = path.join(schemasDir, "valid", "shared-prefix-composite-uniques.prisma");

    await execa("pnpm", ["prisma", "generate", "--schema", schemaPath]);

    const client = await fs.readFile("./tests/projection/generated/prisma-idb/client/prisma-idb-client.ts", "utf8");
    const sharedPrefixBranchCount = client.match(/if \(aEq !== undefined\)/g) ?? [];

    expect(sharedPrefixBranchCount).toHaveLength(1);
    expect(client).toContain('const objectStore = tx.objectStore("MultipleCompositeUniques");');
    expect(client).toContain('objectStore.index("a_bIndex").getAll(');
    expect(client).toContain('objectStore.index("a_cIndex").getAll(');
    expect(client).toContain("return IDBUtils.removeDuplicatesByKeyPath(");
  }, 20000);

  it("forwards update projections and emits safe key-path updateMany handling", async () => {
    const schemaPath = path.join(schemasDir, "valid", "user-board-todo.prisma");

    await execa("pnpm", ["prisma", "generate", "--schema", schemaPath]);

    const client = await fs.readFile("./tests/projection/generated/prisma-idb/client/prisma-idb-client.ts", "utf8");

    expect(client).toContain("select: query.select,");
    expect(client).toContain('...("include" in query ? { include: query.include } : {}),');
    expect(client).toContain("for (const record of records) {");

    const updateRecordStart = client.indexOf(
      'private async _updateRecord<Q extends Prisma.Args<Prisma.BoardDelegate, "update">>('
    );
    const relationHandlingIndex = client.indexOf("if (query.data.user)", updateRecordStart);
    const scalarHandlingIndex = client.indexOf(
      'const stringFields = ["id", "name", "userId"] as const;',
      updateRecordStart
    );

    expect(updateRecordStart).toBeGreaterThan(-1);
    expect(relationHandlingIndex).toBeGreaterThan(updateRecordStart);
    expect(scalarHandlingIndex).toBeGreaterThan(updateRecordStart);
    expect(relationHandlingIndex).toBeLessThan(scalarHandlingIndex);
  }, 20000);

  it("generates correct batch-processor for optional relations in ownership path", async () => {
    const schemaPath = path.join(schemasDir, "valid", "user-meal-foodentry-optional.prisma");

    await execa("pnpm", ["prisma", "generate", "--schema", schemaPath]);

    const batchProcessor = await fs.readFile(
      "./tests/projection/generated/prisma-idb/server/batch-processor.ts",
      "utf8"
    );

    // Verify optional chaining is placed after the optional relation field, before the next access
    expect(batchProcessor).toContain("record.meal?.user.id !== scopeKey");
    // Verify null FK guard throws SCOPE_VIOLATION instead of skipping the ownership check
    expect(batchProcessor).toContain("if (data.mealId == null)");
    expect(batchProcessor).not.toContain("?? undefined");

    expect(batchProcessor).toMatchSnapshot();
  }, 20000);

  it("generates correct batch-processor for multiple optional ownership paths", async () => {
    const schemaPath = path.join(schemasDir, "valid", "user-meal-recipe-foodentry-multi-path.prisma");

    await execa("pnpm", ["prisma", "generate", "--schema", schemaPath]);

    const batchProcessor = await fs.readFile(
      "./tests/projection/generated/prisma-idb/server/batch-processor.ts",
      "utf8"
    );

    // Multi-path: FoodEntry has 3 paths to User: user (direct, required), meal→user, recipe→user
    // Should use multi-path ownership check (ownershipVerified pattern) instead of single-path
    expect(batchProcessor).toContain("let ownershipVerified = false;");

    // Required direct path (user) should fail-fast if not owned by scope
    expect(batchProcessor).toContain("if (!p0 || p0.id !== scopeKey)");
    expect(batchProcessor).toContain("ownershipVerified = true;");

    // Should NOT short-circuit — all populated paths must be validated
    expect(batchProcessor).not.toContain("!ownershipVerified &&");

    // Optional paths (meal, recipe) should have null FK guards
    expect(batchProcessor).toContain("data.mealId !== null");
    expect(batchProcessor).toContain("data.recipeId !== null");

    // Multi-path select should include all paths for DB-based checks
    expect(batchProcessor).toContain("user: { select: { id: true } }");
    expect(batchProcessor).toContain("meal: { select: { user: { select: { id: true } } } }");
    expect(batchProcessor).toContain("recipe: { select: { user: { select: { id: true } } } }");

    // DB-based ownership check should OR all paths (used in UPDATE existing and DELETE)
    expect(batchProcessor).toContain(
      "record.user.id !== scopeKey && record.meal?.user.id !== scopeKey && record.recipe?.user.id !== scopeKey"
    );

    // Should NOT have null FK guard throwing (that's the single-path pattern)
    expect(batchProcessor).not.toContain("has null foreign key(s) in ownership path");

    expect(batchProcessor).toMatchSnapshot();
  }, 20000);

  it("generates correct batch-processor for complex multi-path with varying depths and middle optional", async () => {
    const schemaPath = path.join(schemasDir, "valid", "complex-multi-path-optional.prisma");

    await execa("pnpm", ["prisma", "generate", "--schema", schemaPath]);

    const batchProcessor = await fs.readFile(
      "./tests/projection/generated/prisma-idb/server/batch-processor.ts",
      "utf8"
    );

    // Ticket has 3 paths to User:
    //   Path 1 (length 1): assignee? → User (direct optional)
    //   Path 2 (length 2): project? → user (first relation optional)
    //   Path 3 (length 3): team → department? → user (middle relation optional, first required)
    expect(batchProcessor).toContain("let ownershipVerified = false;");

    // Path 1: direct optional assignee — guarded by null check on assigneeId
    expect(batchProcessor).toContain("data.assigneeId !== null");
    expect(batchProcessor).toContain("if (!p0 || p0.id !== scopeKey)");

    // Path 2: optional project — guarded by null check on projectId
    expect(batchProcessor).toContain("data.projectId !== null");
    // project lookup should select the user chain
    expect(batchProcessor).toContain("project: { select: { user: { select: { id: true } } } }");

    // Path 3: required team with optional middle (department?) — NO null guard
    // The team lookup should have a nested department→user select
    expect(batchProcessor).toContain(
      "team: { select: { department: { select: { user: { select: { id: true } } } } } }"
    );
    // Access chain must use ?. after the optional department relation
    expect(batchProcessor).toContain("p2.department?.user.id !== scopeKey");

    // DB ownership condition in UPDATE/DELETE should chain all paths with optional chaining
    expect(batchProcessor).toContain("record.assignee?.id !== scopeKey");
    expect(batchProcessor).toContain("record.project?.user.id !== scopeKey");
    expect(batchProcessor).toContain("record.team.department?.user.id !== scopeKey");

    // pullAndMaterializeLogs should use OR clause for scope filtering
    expect(batchProcessor).toContain("assignee: { id: scopeKey }");
    expect(batchProcessor).toContain("project: { user: { id: scopeKey } }");
    expect(batchProcessor).toContain("team: { department: { user: { id: scopeKey } } }");

    // No short-circuit
    expect(batchProcessor).not.toContain("!ownershipVerified &&");

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
