import fs from "fs";
import path from "path";
import { getUniqueIdentifiers } from "./utils";
import type { DMMF } from "@prisma/generator-helper";

// --- Snapshot types ---

export interface SnapshotField {
  name: string;
  type: string;
  kind: string;
  isList: boolean;
  isRequired: boolean;
}

export interface SnapshotIndex {
  name: string;
  keyPath: string | string[];
  unique: boolean;
}

export interface SnapshotModel {
  name: string;
  keyPath: string | string[];
  fields: SnapshotField[];
  indexes: SnapshotIndex[];
}

export interface SnapshotEnum {
  name: string;
  values: string[];
}

export interface Snapshot {
  version: number;
  models: SnapshotModel[];
  enums: SnapshotEnum[];
}

// --- Migration diff types ---

export type MigrationOp =
  | { type: "createObjectStore"; name: string; keyPath: string | string[] }
  | { type: "deleteObjectStore"; name: string }
  | { type: "createIndex"; storeName: string; indexName: string; keyPath: string | string[]; unique: boolean }
  | { type: "deleteIndex"; storeName: string; indexName: string }
  | { type: "addField"; storeName: string; fieldName: string; fieldType: string; isList: boolean; isRequired: boolean }
  | { type: "removeField"; storeName: string; fieldName: string }
  | { type: "addEnumValue"; enumName: string; value: string }
  | { type: "removeEnumValue"; enumName: string; value: string };

export interface MigrationDiff {
  ops: MigrationOp[];
  ambiguities: AmbiguityNote[];
}

export type AmbiguityNote =
  | { type: "possibleRename"; removedModel: string; addedModel: string }
  | { type: "possibleFieldRename"; storeName: string; removedField: string; addedField: string }
  | { type: "possibleEnumValueRename"; enumName: string; removedValue: string; addedValue: string };

// --- Core functions ---

/**
 * List migration folder names from prisma/migrations/ directory, sorted alphabetically.
 * Returns empty array if the directory doesn't exist.
 */
export function listMigrationFolders(schemaPath: string): string[] {
  const schemaDir =
    fs.existsSync(schemaPath) && fs.statSync(schemaPath).isDirectory() ? schemaPath : path.dirname(schemaPath);
  const migrationsDir = path.join(schemaDir, "migrations");

  if (!fs.existsSync(migrationsDir)) return [];

  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "migration_lock.toml")
    .map((entry) => entry.name)
    .sort();
}

/**
 * Extract an IDB-structural snapshot from DMMF models.
 * Captures model names, keyPaths, index names, index keyPaths, and uniqueness.
 */
export function extractSnapshot(
  models: readonly DMMF.Model[],
  version: number,
  enums?: readonly DMMF.DatamodelEnum[]
): Snapshot {
  const snapshotModels: SnapshotModel[] = models.map((model) => {
    const uniqueIds = getUniqueIdentifiers(model);
    const primaryKey = uniqueIds[0];
    const keyPath = JSON.parse(primaryKey.keyPath) as string[];
    const normalizedKeyPath = keyPath.length === 1 ? keyPath[0] : keyPath;

    const fields: SnapshotField[] = model.fields
      .filter((f) => f.kind === "scalar" || f.kind === "enum")
      .map((f) => ({
        name: f.name,
        type: f.type,
        kind: f.kind,
        isList: f.isList,
        isRequired: f.isRequired,
      }));

    const indexes: SnapshotIndex[] = uniqueIds.slice(1).map((uid) => {
      const idxKeyPath = JSON.parse(uid.keyPath) as string[];
      return {
        name: uid.name,
        keyPath: idxKeyPath.length === 1 ? idxKeyPath[0] : idxKeyPath,
        unique: true,
      };
    });

    return {
      name: model.name,
      keyPath: normalizedKeyPath,
      fields,
      indexes,
    };
  });

  // Sort models by name for deterministic output
  snapshotModels.sort((a, b) => a.name.localeCompare(b.name));

  const snapshotEnums: SnapshotEnum[] = (enums ?? []).map((e) => ({
    name: e.name,
    values: e.values.map((v) => v.name).sort(),
  }));
  snapshotEnums.sort((a, b) => a.name.localeCompare(b.name));

  return { version, models: snapshotModels, enums: snapshotEnums };
}

/**
 * Compute a deterministic djb2 hash of the IDB-structural snapshot.
 * Only hashes model names, keyPaths, index names, index keyPaths, and uniqueness.
 */
export function computeSchemaHash(snapshot: Snapshot): string {
  const json = JSON.stringify(snapshot.models);
  let hash = 5381;
  for (let i = 0; i < json.length; i++) {
    hash = ((hash << 5) + hash + json.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16);
}

/**
 * Compute the diff between two consecutive snapshots.
 * Version 0 (empty) → version 1 means prev is null.
 */
export function computeDiff(prev: Snapshot | null, curr: Snapshot): MigrationDiff {
  const ops: MigrationOp[] = [];
  const ambiguities: AmbiguityNote[] = [];

  const prevModels = new Map((prev?.models ?? []).map((m) => [m.name, m]));
  const currModels = new Map(curr.models.map((m) => [m.name, m]));

  const removedModels: string[] = [];
  const addedModels: string[] = [];

  // Find removed models
  for (const [name] of prevModels) {
    if (!currModels.has(name)) {
      removedModels.push(name);
    }
  }

  // Find added models
  for (const [name] of currModels) {
    if (!prevModels.has(name)) {
      addedModels.push(name);
    }
  }

  // Detect possible renames (removed + added in same migration)
  if (removedModels.length > 0 && addedModels.length > 0) {
    for (const removed of removedModels) {
      for (const added of addedModels) {
        ambiguities.push({ type: "possibleRename", removedModel: removed, addedModel: added });
      }
    }
  }

  // Emit delete ops for removed models
  for (const name of removedModels) {
    ops.push({ type: "deleteObjectStore", name });
  }

  // Emit create ops for added models
  for (const name of addedModels) {
    const model = currModels.get(name)!;
    ops.push({ type: "createObjectStore", name, keyPath: model.keyPath });
    for (const idx of model.indexes) {
      ops.push({ type: "createIndex", storeName: name, indexName: idx.name, keyPath: idx.keyPath, unique: idx.unique });
    }
  }

  // For models that exist in both, diff fields and indexes
  for (const [name, currModel] of currModels) {
    const prevModel = prevModels.get(name);
    if (!prevModel) continue; // already handled as new model

    // Diff fields
    const prevFields = new Map(prevModel.fields.map((f) => [f.name, f]));
    const currFields = new Map(currModel.fields.map((f) => [f.name, f]));

    const removedFields: string[] = [];
    const addedFields: string[] = [];

    for (const [fieldName] of prevFields) {
      if (!currFields.has(fieldName)) {
        removedFields.push(fieldName);
        ops.push({ type: "removeField", storeName: name, fieldName });
      }
    }

    for (const [fieldName, field] of currFields) {
      if (!prevFields.has(fieldName)) {
        addedFields.push(fieldName);
        ops.push({
          type: "addField",
          storeName: name,
          fieldName,
          fieldType: field.type,
          isList: field.isList,
          isRequired: field.isRequired,
        });
      }
    }

    // Detect possible field renames (removed + added in same model)
    if (removedFields.length > 0 && addedFields.length > 0) {
      for (const removed of removedFields) {
        for (const added of addedFields) {
          ambiguities.push({ type: "possibleFieldRename", storeName: name, removedField: removed, addedField: added });
        }
      }
    }

    // Diff indexes
    const prevIndexes = new Map(prevModel.indexes.map((idx) => [idx.name, idx]));
    const currIndexes = new Map(currModel.indexes.map((idx) => [idx.name, idx]));

    for (const [idxName] of prevIndexes) {
      if (!currIndexes.has(idxName)) {
        ops.push({ type: "deleteIndex", storeName: name, indexName: idxName });
      }
    }

    for (const [idxName, idx] of currIndexes) {
      if (!prevIndexes.has(idxName)) {
        ops.push({
          type: "createIndex",
          storeName: name,
          indexName: idxName,
          keyPath: idx.keyPath,
          unique: idx.unique,
        });
      }
    }
  }

  // Diff enums
  const prevEnums = new Map((prev?.enums ?? []).map((e) => [e.name, e]));
  const currEnums = new Map(curr.enums.map((e) => [e.name, e]));

  for (const [enumName, currEnum] of currEnums) {
    const prevEnum = prevEnums.get(enumName);
    if (!prevEnum) continue; // new enum — values are implicitly available

    const prevValues = new Set(prevEnum.values);
    const currValues = new Set(currEnum.values);

    const removedValues: string[] = [];
    const addedValues: string[] = [];

    for (const v of prevValues) {
      if (!currValues.has(v)) {
        removedValues.push(v);
        ops.push({ type: "removeEnumValue", enumName, value: v });
      }
    }

    for (const v of currValues) {
      if (!prevValues.has(v)) {
        addedValues.push(v);
        ops.push({ type: "addEnumValue", enumName, value: v });
      }
    }

    if (removedValues.length > 0 && addedValues.length > 0) {
      for (const removed of removedValues) {
        for (const added of addedValues) {
          ambiguities.push({ type: "possibleEnumValueRename", enumName, removedValue: removed, addedValue: added });
        }
      }
    }
  }

  return { ops, ambiguities };
}
