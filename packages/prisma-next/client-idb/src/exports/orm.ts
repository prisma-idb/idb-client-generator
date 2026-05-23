// ── IDB ORM client ────────────────────────────────────────────────────────────

// Factory + client type
export { idbOrm } from "../core/idb-orm";
export type { IdbOrmClient, IdbOrmOptions } from "../core/idb-orm";

// Accessor interface (useful for annotating function parameters / return types)
export type { IdbStoreAccessor } from "../core/store-accessor";

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
  ReferenceRelKeys,
  IncludeSpec,
  NoIncludes,
  IncludedRow,
  OrderBySpec,
  SortDirection,
} from "../core/types";
