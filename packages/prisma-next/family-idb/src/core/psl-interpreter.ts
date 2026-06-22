import type { ContractSourceDiagnostic, ContractSourceDiagnostics } from "@prisma-next/config/config-types";
import { computeProfileHash, computeStorageHash } from "@prisma-next/contract/hashing";
import type { ApplicationDomain, Contract, ContractField } from "@prisma-next/contract/types";
import { UNBOUND_DOMAIN_NAMESPACE_ID, crossRef } from "@prisma-next/contract/types";
import type { PslDocumentAst, PslField, PslModel } from "@prisma-next/framework-components/psl-ast";
import { flatPslModels } from "@prisma-next/framework-components/psl-ast";
import type {
  IdbIndexDefinition,
  IdbModelStorage,
  IdbReferentialAction,
  IdbStorage,
  IdbStoreDefinition,
} from "@prisma-next-idb/target-idb/pack";
import { notOk, ok } from "@prisma-next/utils/result";
import type { Result } from "@prisma-next/utils/result";
import { validateContract } from "./validate";

// ── Scalar type → codec ID mapping ────────────────────────────────────────────

const SCALAR_TO_CODEC_ID: Record<string, string> = {
  String: "idb/string@1",
  Int: "idb/int32@1",
  Float: "idb/double@1",
  Boolean: "idb/bool@1",
  DateTime: "idb/date@1",
  BigInt: "idb/bigint@1",
  Decimal: "idb/decimal@1",
  Json: "idb/json@1",
  Bytes: "idb/bytes@1",
};

// PSL PascalCase referential actions → IDB lowercase
const REFERENTIAL_ACTION_MAP: Record<string, IdbReferentialAction> = {
  Cascade: "cascade",
  SetNull: "setNull",
  SetDefault: "setDefault",
  Restrict: "restrict",
  NoAction: "noAction",
};

// ── Attribute arg helpers ──────────────────────────────────────────────────────

type AttributeArg = { kind: string; name?: string; value: string };

function findPositionalArg(args: readonly AttributeArg[]): string | undefined {
  return args.find((a) => a.kind === "positional")?.value;
}

function findNamedArg(args: readonly AttributeArg[], name: string): string | undefined {
  return (args.find((a) => a.kind === "named" && a.name === name) as AttributeArg | undefined)?.value;
}

function parseStringArg(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const t = raw.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return undefined;
}

function parseFieldList(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const t = raw.trim();
  if (!t.startsWith("[") || !t.endsWith("]")) return undefined;
  const inner = t.slice(1, -1).trim();
  if (inner === "") return [];
  return inner
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// ── Field helpers ──────────────────────────────────────────────────────────────

function hasFieldAttribute(field: PslField, name: string): boolean {
  return field.attributes.some((a) => a.name === name);
}

function getFieldAttribute(field: PslField, name: string) {
  return field.attributes.find((a) => a.name === name);
}

// ── Per-model interpretation result ───────────────────────────────────────────

interface InterpretedModel {
  readonly modelName: string;
  readonly storeName: string;
  readonly keyPath: string;
  readonly indexes: Record<string, IdbIndexDefinition>;
  readonly fields: Record<string, ContractField>;
  readonly relations: Record<
    string,
    {
      readonly to: ReturnType<typeof crossRef>;
      readonly cardinality: "1:1" | "1:N" | "N:1";
      readonly on: { readonly localFields: readonly string[]; readonly targetFields: readonly string[] };
    }
  >;
  readonly relationsStorage: Record<string, { onDelete?: IdbReferentialAction }>;
  /** FK-side declarations keyed by targetModelName for back-relation resolution. */
  readonly fksByTarget: ReadonlyMap<string, { fieldName: string; localFields: string[]; targetFields: string[] }>;
}

// ── Core interpreter ───────────────────────────────────────────────────────────

function interpretModel(
  model: PslModel,
  modelNames: ReadonlySet<string>,
  sourceId: string,
  diagnostics: ContractSourceDiagnostic[]
): InterpretedModel | undefined {
  // Derive store name from @@map or lowerFirst(modelName)
  const mapAttr = model.attributes.find((a) => a.name === "map");
  const storeName = parseStringArg(findPositionalArg(mapAttr?.args ?? [])) ?? lowerFirst(model.name);

  // Find the keyPath: @id field-level attribute OR @@id([field]) model-level
  let keyPath: string | undefined;
  let idFieldName: string | undefined;

  const idModelAttr = model.attributes.find((a) => a.name === "id");
  if (idModelAttr) {
    const fields = parseFieldList(findPositionalArg(idModelAttr.args));
    if (!fields || fields.length === 0) {
      diagnostics.push({
        code: "IDB_INVALID_ID",
        message: `Model "${model.name}" @@id([…]) is missing a field list.`,
        sourceId,
        span: idModelAttr.span,
      });
      return undefined;
    }
    if (fields.length > 1) {
      diagnostics.push({
        code: "IDB_NO_COMPOUND_KEY",
        message: `Model "${model.name}" @@id([${fields.join(", ")}]) declares a compound key. IDB does not support compound primary keys — use a single @id field instead.`,
        sourceId,
        span: idModelAttr.span,
      });
      return undefined;
    }
    idFieldName = fields[0];
    keyPath = fields[0];
  }

  const idFields = model.fields.filter((f) => hasFieldAttribute(f, "id"));
  if (idFields.length > 1) {
    diagnostics.push({
      code: "IDB_MULTIPLE_ID_FIELDS",
      message: `Model "${model.name}" declares @id on multiple fields (${idFields.map((f) => f.name).join(", ")}). Only one @id field is allowed.`,
      sourceId,
      span: model.span,
    });
    return undefined;
  }
  if (idFields.length === 1) {
    if (keyPath !== undefined) {
      diagnostics.push({
        code: "IDB_INVALID_ID",
        message: `Model "${model.name}" cannot declare both a field-level @id and a model-level @@id.`,
        sourceId,
        span: model.span,
      });
      return undefined;
    }
    idFieldName = idFields[0]!.name;
    keyPath = idFields[0]!.name;
  }

  if (keyPath === undefined) {
    diagnostics.push({
      code: "IDB_MISSING_ID",
      message: `Model "${model.name}" has no @id field. Add @id to exactly one scalar field.`,
      sourceId,
      span: model.span,
    });
    return undefined;
  }

  // ── Build indexes ────────────────────────────────────────────────────────────
  const indexes: Record<string, IdbIndexDefinition> = {};

  // @@index([fields]) model attribute
  for (const attr of model.attributes) {
    if (attr.name !== "index" && attr.name !== "unique") continue;
    const isUnique = attr.name === "unique";
    const fieldListRaw = findPositionalArg(attr.args);
    const fields = parseFieldList(fieldListRaw);
    if (!fields || fields.length === 0) {
      diagnostics.push({
        code: "IDB_INVALID_INDEX",
        message: `Model "${model.name}" @@${attr.name} is missing a field list.`,
        sourceId,
        span: attr.span,
      });
      continue;
    }
    if (fields.length > 1) {
      diagnostics.push({
        code: "IDB_COMPOUND_INDEX_UNSUPPORTED",
        message: `Model "${model.name}" @@${attr.name}([${fields.join(", ")}]) declares a compound index. IDB compound indexes are not yet supported — use a single-field index.`,
        sourceId,
        span: attr.span,
      });
      continue;
    }
    const field = fields[0]!;
    const nameRaw = findNamedArg(attr.args, "name") ?? findNamedArg(attr.args, "map");
    const indexName = parseStringArg(nameRaw) ?? (isUnique ? `${field}_unique` : field);
    indexes[indexName] = { keyPath: field, unique: isUnique };
  }

  // ── Walk fields ──────────────────────────────────────────────────────────────
  const contractFields: Record<string, ContractField> = {};
  const relations: InterpretedModel["relations"] = {};
  const relationsStorage: Record<string, { onDelete?: IdbReferentialAction }> = {};
  const fksByTarget = new Map<string, { fieldName: string; localFields: string[]; targetFields: string[] }>();

  for (const field of model.fields) {
    // Skip the @id field's optional marker — keyPath fields cannot be nullable in IDB
    if (field.name === idFieldName && field.optional) {
      diagnostics.push({
        code: "IDB_NULLABLE_ID",
        message: `Field "${model.name}.${field.name}" is marked as @id but is optional (?). The primary key cannot be nullable.`,
        sourceId,
        span: field.span,
      });
    }

    // Relation list field (backrelation) — skip for now, resolved in second pass
    if (field.list && modelNames.has(field.typeName)) {
      continue;
    }

    // FK-side relation field: non-list, type is a model, has @relation
    const relationAttr = getFieldAttribute(field, "relation");
    if (!field.list && modelNames.has(field.typeName) && relationAttr) {
      const args = relationAttr.args;
      const localFieldsRaw = findNamedArg(args, "fields");
      const targetFieldsRaw = findNamedArg(args, "references");
      const localFields = parseFieldList(localFieldsRaw);
      const targetFields = parseFieldList(targetFieldsRaw);

      if (!localFields || localFields.length === 0 || !targetFields || targetFields.length === 0) {
        diagnostics.push({
          code: "IDB_INVALID_RELATION",
          message: `Relation field "${model.name}.${field.name}" must declare both fields and references in @relation.`,
          sourceId,
          span: field.span,
        });
        continue;
      }
      if (localFields.length !== targetFields.length) {
        diagnostics.push({
          code: "IDB_INVALID_RELATION",
          message: `Relation field "${model.name}.${field.name}" must have the same number of fields and references.`,
          sourceId,
          span: field.span,
        });
        continue;
      }

      const onDeleteRaw = findNamedArg(args, "onDelete");
      const onDelete = onDeleteRaw ? REFERENTIAL_ACTION_MAP[onDeleteRaw.trim()] : undefined;

      if (onDeleteRaw && onDelete === undefined) {
        diagnostics.push({
          code: "IDB_UNKNOWN_REFERENTIAL_ACTION",
          message: `Relation field "${model.name}.${field.name}" has unknown onDelete value "${onDeleteRaw}". Valid values: ${Object.keys(REFERENTIAL_ACTION_MAP).join(", ")}.`,
          sourceId,
          span: field.span,
        });
      }

      relations[field.name] = {
        to: crossRef(field.typeName),
        cardinality: "N:1",
        on: { localFields, targetFields },
      };
      if (onDelete !== undefined) {
        relationsStorage[field.name] = { onDelete };
      }
      fksByTarget.set(field.typeName, {
        fieldName: field.name,
        localFields,
        targetFields,
      });

      // Also create a default index on the FK field(s) if not already indexed
      for (const fkField of localFields) {
        if (!(fkField in indexes)) {
          indexes[fkField] = { keyPath: fkField, unique: false };
        }
      }
      continue;
    }

    // Non-model relation field without @relation — not a scalar, skip with error
    if (!field.list && modelNames.has(field.typeName) && !relationAttr) {
      diagnostics.push({
        code: "IDB_MISSING_RELATION_ATTRIBUTE",
        message: `Field "${model.name}.${field.name}" has model type "${field.typeName}" but no @relation attribute. Add @relation(fields: [...], references: [...]).`,
        sourceId,
        span: field.span,
      });
      continue;
    }

    // Skip list fields of non-model types (JSON arrays etc. are handled as Json codec)
    if (field.list) {
      // Only model-type lists are backrelations; non-model lists are not supported in IDB.
      continue;
    }

    // Scalar field
    const codecId = SCALAR_TO_CODEC_ID[field.typeName];
    if (codecId === undefined) {
      diagnostics.push({
        code: "IDB_UNSUPPORTED_FIELD_TYPE",
        message: `Field "${model.name}.${field.name}" has unsupported type "${field.typeName}". Supported types: ${Object.keys(SCALAR_TO_CODEC_ID).join(", ")}.`,
        sourceId,
        span: field.span,
      });
      continue;
    }

    contractFields[field.name] = {
      nullable: field.optional,
      type: { kind: "scalar", codecId },
    };

    // @unique field attribute → unique index
    if (hasFieldAttribute(field, "unique")) {
      const existingKey = Object.entries(indexes).find(([, idx]) => idx.keyPath === field.name)?.[0];
      if (!existingKey) {
        indexes[`${field.name}_unique`] = { keyPath: field.name, unique: true };
      }
    }
  }

  return {
    modelName: model.name,
    storeName,
    keyPath,
    indexes,
    fields: contractFields,
    relations,
    relationsStorage,
    fksByTarget,
  };
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Interprets a parsed PSL document AST and produces an IDB `Contract`.
 *
 * This is the IDB equivalent of `interpretPslDocumentToSqlContract` from the
 * SQL family. It handles IDB-specific constraints:
 *
 * - No namespace blocks (IDB has a single implicit `__unbound__` namespace)
 * - No compound primary keys (IDB `keyPath` must be a single field)
 * - Relations are FK-side (`@relation`) + backrelation list fields
 * - Indexes map directly to `IDBObjectStore.createIndex()` calls
 */
export function interpretPslDocumentToIdbContract(
  ast: PslDocumentAst,
  sourceId: string
): Result<Contract<IdbStorage>, ContractSourceDiagnostics> {
  const diagnostics: ContractSourceDiagnostic[] = [];

  // IDB does not support namespace blocks
  const explicitNamespaces = ast.namespaces.filter((ns) => ns.name !== "__unspecified__");
  for (const ns of explicitNamespaces) {
    diagnostics.push({
      code: "IDB_UNSUPPORTED_NAMESPACE_BLOCK",
      message: `IDB does not support \`namespace ${ns.name} { … }\` blocks. All models must be declared at the top level.`,
      sourceId,
      span: ns.span,
    });
  }

  const allModels = flatPslModels(ast);
  const modelNames = new Set(allModels.map((m) => m.name));
  const interpretedByName = new Map<string, InterpretedModel>();

  // First pass: interpret each model individually
  for (const model of allModels) {
    const result = interpretModel(model, modelNames, sourceId, diagnostics);
    if (result) {
      interpretedByName.set(model.name, result);
    }
  }

  // Second pass: resolve backrelation list fields
  for (const model of allModels) {
    const interp = interpretedByName.get(model.name);
    if (!interp) continue;

    for (const field of model.fields) {
      if (!field.list || !modelNames.has(field.typeName)) continue;

      const targetInterp = interpretedByName.get(field.typeName);
      if (!targetInterp) continue;

      // Find the FK in the target model that points back to this model
      const fk = targetInterp.fksByTarget.get(model.name);
      if (!fk) {
        diagnostics.push({
          code: "IDB_UNRESOLVED_BACKRELATION",
          message: `Backrelation field "${model.name}.${field.name}" (list of ${field.typeName}) has no matching @relation in "${field.typeName}" pointing to "${model.name}". Add @relation(fields: [...], references: [...]) to the FK field in "${field.typeName}".`,
          sourceId,
          span: field.span,
        });
        continue;
      }

      // The 1:N side: localFields are the PK fields of this model, targetFields are the FK fields in the target
      const mutableInterp = interp as { relations: Record<string, unknown> };
      mutableInterp.relations[field.name] = {
        to: crossRef(field.typeName),
        cardinality: "1:N",
        on: { localFields: fk.targetFields, targetFields: fk.localFields },
      };
    }
  }

  if (diagnostics.length > 0) {
    return notOk({
      summary: "PSL to IDB contract interpretation failed",
      diagnostics,
    });
  }

  // ── Build the contract ────────────────────────────────────────────────────────

  const ns = UNBOUND_DOMAIN_NAMESPACE_ID;
  const stores: Record<string, IdbStoreDefinition> = {};
  const roots: Record<string, ReturnType<typeof crossRef>> = {};
  const domainModels: Record<string, unknown> = {};

  for (const [modelName, interp] of interpretedByName) {
    stores[interp.storeName] = {
      keyPath: interp.keyPath,
      ...(Object.keys(interp.indexes).length > 0 ? { indexes: interp.indexes } : {}),
    };

    roots[interp.storeName] = crossRef(modelName);

    const modelStorage: IdbModelStorage =
      Object.keys(interp.relationsStorage).length > 0
        ? { storeName: interp.storeName, keyPath: interp.keyPath, relations: interp.relationsStorage }
        : { storeName: interp.storeName, keyPath: interp.keyPath };

    domainModels[modelName] = {
      fields: interp.fields,
      relations: interp.relations,
      storage: modelStorage,
    };
  }

  const storageBlock = {
    stores,
    namespaces: { [ns]: { id: ns, entries: {} } },
  };

  const capabilities = {
    idb: { ddlOnlyInUpgrade: true, transactionalDDL: true },
  };

  const storageHash = computeStorageHash({
    target: "idb",
    targetFamily: "idb",
    storage: storageBlock,
  });

  const profileHash = computeProfileHash({
    target: "idb",
    targetFamily: "idb",
    capabilities,
  });

  const storage: IdbStorage = { ...storageBlock, storageHash };

  const domain = {
    namespaces: { [ns]: { models: domainModels } },
  } as unknown as ApplicationDomain;

  const contract: Contract<IdbStorage> = {
    target: "idb",
    targetFamily: "idb",
    roots,
    domain,
    storage,
    capabilities,
    extensionPacks: {},
    meta: {},
    profileHash,
  };

  validateContract(contract);
  return ok(contract);
}
