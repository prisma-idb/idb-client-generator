# Prisma DMMF Internals for Generator Contributors

Prisma's **DMMF** (Data Model Meta Format) is the in-memory AST that the generator receives at code-gen time. It lives under `options.dmmf` in the `generatorHandler` callback. Prisma's own docs barely cover it, so this page records everything that matters for this project.

## Top-Level Shape

```text
options.dmmf.datamodel
  ├── models:  DMMF.Model[]
  ├── enums:   DMMF.DatamodelEnum[]
  └── indexes: DMMF.Index[]           ← only @@index, NOT @unique/@@unique/@@id
```

> **Critical**: `indexes` only contains explicit `@@index` directives. Unique constraints and primary keys live on each `Model` object, not here.

In `parseGeneratorConfig.ts` we pull all three out and thread them through every file-creator:

```ts
const models = options.dmmf.datamodel.models;
const enums = options.dmmf.datamodel.enums;
const indexes = options.dmmf.datamodel.indexes; // filtered to valid models later
```

## `DMMF.Model`

Our local alias: `type Model = DMMF.Datamodel["models"][number]`

### Properties we use

| Property              | Type                                          | Notes                                                                                                                                                                                 |
| --------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model.name`          | `string`                                      | PascalCase model name, e.g. `"Post"`. Used everywhere — class names, store names, type lookups.                                                                                       |
| `model.fields`        | `Field[]`                                     | All fields including virtual relation fields (see `field.kind`).                                                                                                                      |
| `model.primaryKey`    | `{ name?: string; fields: string[] } \| null` | Only non-null for **composite** `@@id([a, b])`. Single-field `@id` is `null` here; use `field.isId` instead.                                                                          |
| `model.uniqueIndexes` | `{ name?: string; fields: string[] }[]`       | Composite `@@unique([a, b])` constraints. Single `@unique` fields are on `field.isUnique`, not here.                                                                                  |
| `model.uniqueFields`  | `string[][]`                                  | Legacy representation of `@@unique` as a plain array-of-arrays. Only used in `scoped-schema/create.ts` to re-emit `@@unique([...])` directives. Prefer `uniqueIndexes` for IDB logic. |

### Deriving the IDB key path

```text
1. model.primaryKey != null  →  composite @@id  →  key = primaryKey.fields
2. model.fields.find(f => f.isId)  →  single @id  →  key = [idField.name]
3. (neither)  →  error: no valid IDB key
```

`getUniqueIdentifiers()` in `utils.ts` covers all of this and also adds `@unique` / `@@unique` as secondary unique indexes.

## `DMMF.Field`

Our local alias: `type Field = Model["fields"][number]`

### `field.kind` — the most important discriminant

| Value           | Meaning                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `"scalar"`      | Regular data field (string, int, datetime, bytes, …). Always has a column in the DB.            |
| `"object"`      | A relation field. **Does not correspond to a real column.** Represents a link to another model. |
| `"enum"`        | An enum value field.                                                                            |
| `"unsupported"` | A type Prisma can't model (e.g. PostGIS). Skipped in generation.                                |

Filtering out `"object"` fields is the most common guard in the codebase because relation fields don't exist in IDB records — they're populated at query time via `include`.

### Scalar field properties

| Property                | Type                                          | Notes                                                                                                                                                                                                             |
| ----------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `field.name`            | `string`                                      | camelCase field name.                                                                                                                                                                                             |
| `field.type`            | `string`                                      | Prisma type: `"String"`, `"Int"`, `"Float"`, `"Boolean"`, `"DateTime"`, `"Json"`, `"BigInt"`, `"Decimal"`, `"Bytes"`, or a model/enum name.                                                                       |
| `field.isRequired`      | `boolean`                                     | `false` means the field is optional (`?`).                                                                                                                                                                        |
| `field.isList`          | `boolean`                                     | `true` for array fields (`String[]`).                                                                                                                                                                             |
| `field.isId`            | `boolean`                                     | `true` for the single `@id` field. `false` on every field when model uses composite `@@id`.                                                                                                                       |
| `field.isUnique`        | `boolean`                                     | `true` for `@unique` fields. Does **not** cover `@@unique`; use `model.uniqueIndexes` for that.                                                                                                                   |
| `field.isUpdatedAt`     | `boolean`                                     | `@updatedAt` annotation; auto-set by Prisma on writes.                                                                                                                                                            |
| `field.hasDefaultValue` | `boolean`                                     | `true` when `@default(...)` is present.                                                                                                                                                                           |
| `field.default`         | `scalar \| { name: string; args: unknown[] }` | If it's an object with `.name`, it's a function default (`uuid()`, `cuid()`, `autoincrement()`, `now()`). Otherwise it's a literal. Always guard: `typeof field.default === "object" && "name" in field.default`. |

### Relation field properties (`field.kind === "object"`)

| Property                   | Type                  | Notes                                                                                                                 |
| -------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `field.relationName`       | `string`              | The Prisma relation name that ties both sides together.                                                               |
| `field.relationFromFields` | `string[]`            | FK column names **on this model**. Non-empty only on the owning side. Empty `[]` on the back-reference side.          |
| `field.relationToFields`   | `string[]`            | The referenced column names **on the other model** (usually its PK). Parallel array to `relationFromFields`.          |
| `field.relationOnDelete`   | `string \| undefined` | `"Cascade"`, `"SetNull"`, `"SetDefault"`, `"Restrict"`, `"NoAction"`. Drives delete propagation logic in `delete.ts`. |

#### Identifying the FK-owning side of a relation

```ts
// Only the owning side has FK columns to index
if (field.kind !== "object" || !field.relationFromFields?.length) continue;
// field.relationFromFields = ["authorId"], field.relationToFields = ["id"]
```

This is the guard in `getForeignKeyIndexes()` — if `relationFromFields` is empty, this side of the relation is a pure back-reference with no real column.

## `DMMF.Index`

Represents an explicit `@@index([...])` directive. **Not** used for primary keys or unique constraints.

```ts
interface Index {
  model: string; // model name
  type: "normal" | "unique"; // in practice we only process "normal" here
  fields: { name: string }[]; // array of { name } objects (not plain strings!)
  name?: string; // user-defined name, or undefined
}
```

> **Gotcha**: `idx.fields` is an array of objects `{ name: string }`, not an array of strings. Always `.map(f => f.name)` before use.

## `DMMF.DatamodelEnum`

```ts
interface DatamodelEnum {
  name: string; // enum type name
  values: { name: string }[]; // each member
}
```

Used in `enums/create.ts` to emit the TypeScript enum and in `validators/model-validator.ts` to generate Zod enum validators.

## How we derive each IDB construct

### Primary key (IDB `keyPath`)

```text
model.primaryKey != null
  → composite @@id: keyPath = ["fieldA", "fieldB"]

model.fields.find(f => f.isId)
  → single @id:    keyPath = ["id"]
```

### Unique indexes (IDB unique indexes)

- Single `@unique` → `field.isUnique === true` → `keyPath = [field.name]`
- Composite `@@unique` → `model.uniqueIndexes[n].fields` → `keyPath = [...]`

### Non-unique indexes (IDB regular indexes)

- Explicit `@@index` → `DMMF.Index` in `options.dmmf.datamodel.indexes` where `idx.type === "normal"`
- Auto-generated FK indexes → fields where `field.kind === "object" && field.relationFromFields.length > 0`

Both paths go through `utils.ts` (`getNonUniqueIndexes`, `getForeignKeyIndexes`) and deduplicate against already-indexed key paths.

### Valid IDB key types

Not all Prisma types can be used as IndexedDB keys (`IDBValidKey = number | string | Date | BufferSource | IDBValidKey[]`):

| Prisma type                            | IDB-compatible         |
| -------------------------------------- | ---------------------- |
| `Int`, `Float`                         | ✅ number              |
| `String`                               | ✅ string              |
| `DateTime`                             | ✅ Date                |
| `Bytes`                                | ✅ BufferSource        |
| `Boolean`, `Json`, `BigInt`, `Decimal` | ❌ — cannot be IDB key |

`validIDBKeyPrismaTypes` in `utils.ts` is the single source of truth. Any index that includes an incompatible type is silently skipped (with an optional log warning).

## Prisma type → TypeScript type mapping

Used when generating type signatures for `keyPath` tuples and validator types:

```ts
const prismaToPrimitiveTypesMap = {
  Int: "number",
  Float: "number",
  String: "string",
  Boolean: "boolean",
  DateTime: "Date",
  Json: "Prisma.InputJsonValue",
  BigInt: "bigint",
  Decimal: "Prisma.Decimal",
  Bytes: "Uint8Array",
};
```

## Common field filter patterns in the generator

Most file creators iterate `model.fields` and filter down:

```ts
// Only real storable fields (no relations)
model.fields.filter((f) => f.kind !== "object");

// Only scalar, non-list fields (for simple key/value writes)
model.fields.filter((f) => f.kind === "scalar" && !f.isList);

// Fields the user must supply (no default, required)
model.fields.filter((f) => f.isRequired && !f.hasDefaultValue && f.kind !== "object");

// Fields that need default-filling at create time
model.fields.filter((f) => f.hasDefaultValue);

// Optional fields (for partial input types)
model.fields.filter((f) => !f.isRequired);
```

## Sync-specific DMMF usage

When `outboxSync` is enabled, `parseGeneratorConfig.ts` enforces extra invariants by reading DMMF:

- Every syncable model's `@id` field **must** have a function default of `uuid` or `cuid` (`field.default.name`). Auto-increment and composite `@@id` are forbidden.
- The `rootModel` must exist in `models` and have a valid `@id`.
- The Changelog and Version meta models (if provided in config) must also exist in the DMMF and have the expected shape.
