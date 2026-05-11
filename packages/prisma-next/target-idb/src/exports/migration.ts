/**
 * @prisma-next-idb/target-idb/migration
 *
 * Public API for authoring and executing IDB migration files.
 *
 * **For migration file authors** — import the factory functions and types:
 * ```ts
 * import { createObjectStoreOp, createIndexOp, type IdbMigration }
 *   from "@prisma-next-idb/target-idb/migration";
 * ```
 *
 * **For migration runners** — import the planner, runner, and driver:
 * ```ts
 * import {
 *   IdbMigrationControlDriverDescriptor,
 *   IdbMigrationPlanner,
 *   IdbMigrationRunner,
 * } from "@prisma-next-idb/target-idb/migration";
 * ```
 */

// ── DDL factory functions ─────────────────────────────────────────────────────

import type {
  CreateIndexOp,
  CreateObjectStoreOp,
  DropIndexOp,
  DropObjectStoreOp,
  IdbDdlOp,
} from "../core/migration-factories";

export {
  createObjectStoreOp,
  dropObjectStoreOp,
  createIndexOp,
  dropIndexOp,
  isIdbDdlOp,
} from "../core/migration-factories";

export type { IdbDdlOp, CreateObjectStoreOp, DropObjectStoreOp, CreateIndexOp, DropIndexOp };

// ── Schema diffing ────────────────────────────────────────────────────────────

export type { IdbSchemaDiffInput } from "../core/schema-diff";
export { diffIdbSchema } from "../core/schema-diff";

// ── Migration control driver ──────────────────────────────────────────────────

export { IdbMigrationControlDriverDescriptor, extractMigrationDriver } from "../core/migration-driver";
export type { IdbMigrationControlDriver } from "../core/migration-driver";

// ── Planner & runner ──────────────────────────────────────────────────────────

export { IdbMigrationRunner } from "../core/migration-runner";
export { IdbMigrationPlanner, contractToIdbSchema } from "../core/migration-planner";
export type { IdbMigrationPlanWithAuthoring } from "../core/migration-planner";

// ── Convenience migration interface for authored migration files ───────────────

/** The shape expected of a user-authored migration file's default export. */
export type IdbMigration = {
  readonly operations: readonly IdbDdlOp[];
};
