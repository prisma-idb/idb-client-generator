// ── IDB ORM client ────────────────────────────────────────────────────────────

// Factory + client type
export { idbOrm } from "../core/idb-orm";
export type { IdbOrmClient, IdbOrmOptions } from "../core/idb-orm";

// Accessor interface (useful for annotating function parameters / return types)
export type { IdbStoreAccessor, WhereCallback } from "../core/store-accessor";

// Executor interface (needed to type the executor passed to idbOrm)
export type { IdbQueryExecutor } from "../core/executor";

// Public row / filter / key types
export type {
  IdbContract,
  DefaultModelRow,
  WhereFilter,
  KeyType,
  ModelKeyPath,
  CreateInput,
  PatchInput,
  ReferenceRelKeys,
  IncludeSpec,
  NoIncludes,
  IncludedRow,
  OrderBySpec,
  SortDirection,
} from "../core/types";

// Filter operator API (Phase 6.1)
export { and, or, not } from "../core/filters";
export type { IdbFieldAccessor, IdbModelAccessor } from "../core/model-accessor";
// AST + factory re-exports so middleware authors don't need to reach into
// `@prisma-next-idb/adapter-idb/runtime` for the filter shape.
export type {
  IdbFilterExpr,
  IdbFieldFilter,
  IdbAndExpr,
  IdbOrExpr,
  IdbNotExpr,
  IdbNullCheckExpr,
  IdbFilterOp,
} from "@prisma-next-idb/adapter-idb/runtime";
