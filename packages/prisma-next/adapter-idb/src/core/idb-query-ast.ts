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
export type IdbQueryAst = IdbFindManyAst | IdbFindUniqueAst | IdbCreateAst | IdbDeleteAst;

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
