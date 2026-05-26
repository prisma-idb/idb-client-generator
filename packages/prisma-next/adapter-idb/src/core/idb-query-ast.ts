/**
 * Lightweight IDB query AST types.
 *
 * IDB has no query language of its own, so these AST nodes describe *intent*
 * rather than compilation targets. The AST is carried on {@link IdbQueryPlan}
 * alongside the execution-ready `idbPlan` body so middleware can inspect
 * query structure without parsing opaque plan bodies.
 *
 * This mirrors the pattern in `@prisma-next/sql-relational-core/ast` where
 * AST nodes carry intent before lowering, even though for IDB the lowering
 * step is an identity passthrough.
 */

import type { IdbFilterExpr } from "./idb-filter-expr";

/**
 * Discriminated union of all IDB query AST nodes.
 *
 * Each node describes one logical operation. The fields are intentionally
 * higher-level than the plan body types — they use model names, field names,
 * and filter shapes rather than store names and key ranges.
 */
export type IdbQueryAst =
  | IdbFindManyAst
  | IdbFindUniqueAst
  | IdbCreateAst
  | IdbDeleteAst
  | IdbUpdateAst
  | IdbUpdateAllAst
  | IdbUpdateCountAst
  | IdbUpsertAst
  | IdbCreateAllAst
  | IdbCreateCountAst
  | IdbDeleteAllAst
  | IdbDeleteCountAst
  | IdbCountAst;

/** Full cursor scan with optional filtering, ordering, and pagination. */
export interface IdbFindManyAst {
  readonly kind: "findMany";
  /** The model (store) being queried. */
  readonly modelName: string;
  /** Where filter expression, lifted from shorthand or callback form. */
  readonly where?: IdbFilterExpr;
  /** Sort order, if any. Maps field name to direction. */
  readonly orderBy?: Record<string, "asc" | "desc">;
  /** Number of rows to skip (OFFSET). */
  readonly skip?: number;
  /** Maximum number of rows to return (LIMIT). */
  readonly take?: number;
}

/** Primary-key or unique-index lookup (O(1)). */
export interface IdbFindUniqueAst {
  readonly kind: "findUnique";
  /** The model (store) being queried. */
  readonly modelName: string;
  /** The key value to look up. */
  readonly key: unknown;
}

/** Insert a single record. */
export interface IdbCreateAst {
  readonly kind: "create";
  /** The model (store) being inserted into. */
  readonly modelName: string;
  /** The record data to insert. */
  readonly data: Record<string, unknown>;
}

/** Delete a record by primary key. */
export interface IdbDeleteAst {
  readonly kind: "delete";
  /** The model (store) being deleted from. */
  readonly modelName: string;
  /** The key value of the record to delete. */
  readonly key: unknown;
}

/** Update the first matching record (cursor scan, take:1). Returns updated row or null. */
export interface IdbUpdateAst {
  readonly kind: "update";
  readonly modelName: string;
  readonly patch: Record<string, unknown>;
  readonly where?: IdbFilterExpr;
}

/** Update all matching records. Returns updated rows as AsyncIterableResult. */
export interface IdbUpdateAllAst {
  readonly kind: "updateAll";
  readonly modelName: string;
  readonly patch: Record<string, unknown>;
  readonly where?: IdbFilterExpr;
}

/** Update all matching records. Returns count only. */
export interface IdbUpdateCountAst {
  readonly kind: "updateCount";
  readonly modelName: string;
  readonly patch: Record<string, unknown>;
  readonly where?: IdbFilterExpr;
}

/** Insert or update a single record depending on whether it already exists. */
export interface IdbUpsertAst {
  readonly kind: "upsert";
  readonly modelName: string;
  readonly create: Record<string, unknown>;
  readonly update: Record<string, unknown>;
  readonly where: Record<string, unknown>;
}

/** Batch insert multiple records. Returns inserted rows as AsyncIterableResult. */
export interface IdbCreateAllAst {
  readonly kind: "createAll";
  readonly modelName: string;
  readonly data: Record<string, unknown>[];
}

/** Batch insert multiple records. Returns count only. */
export interface IdbCreateCountAst {
  readonly kind: "createCount";
  readonly modelName: string;
  readonly data: Record<string, unknown>[];
}

/** Delete all matching records. Returns deleted rows as AsyncIterableResult. */
export interface IdbDeleteAllAst {
  readonly kind: "deleteAll";
  readonly modelName: string;
  readonly where?: IdbFilterExpr;
}

/** Delete all matching records. Returns count only. */
export interface IdbDeleteCountAst {
  readonly kind: "deleteCount";
  readonly modelName: string;
  readonly where?: IdbFilterExpr;
}

/** Count matching records. */
export interface IdbCountAst {
  readonly kind: "count";
  readonly modelName: string;
  readonly where?: IdbFilterExpr;
}
