import CodeBlockWriter from "code-block-writer";
import { toCamelCase } from "../../../../../helpers/utils";
import { Field, Model } from "../../../../types";

export function addApplyRelations(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  writer
    .writeLine(`private async _applyRelations<Q extends Prisma.Args<Prisma.${model.name}Delegate, 'findMany'>>(`)
    .writeLine(`records: Prisma.Result<Prisma.${model.name}Delegate, object, 'findFirstOrThrow'>[],`)
    .writeLine(`tx: IDBUtils.TransactionType,`)
    .writeLine(`query?: Q): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, 'findFirstOrThrow'>[]>`)
    .block(() => {
      addEarlyExit(writer, model);
      addHashJoinBuildPhase(writer, model, models);
      addHashJoinAssignPhase(writer, model, models);
      addReturn(writer, model);
    });
}

function addEarlyExit(writer: CodeBlockWriter, model: Model) {
  writer.writeLine(
    `if (!query) return records as Prisma.Result<Prisma.${model.name}Delegate, Q, 'findFirstOrThrow'>[];`
  );
}

// ---------------------------------------------------------------------------
// BUILD PHASE: one batch fetch per relation, build hash maps
// ---------------------------------------------------------------------------

function addHashJoinBuildPhase(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  const relationFields = model.fields.filter(({ kind }) => kind === "object");
  const allFields = models.flatMap(({ fields }) => fields);

  relationFields.forEach((field) => {
    const otherField = allFields.find((_field) => _field.relationName === field.relationName && field !== _field)!;

    writer.writeLine(`const attach_${field.name} = query.select?.${field.name} || query.include?.${field.name};`);

    const mapValueType = field.isList ? "unknown[]" : "unknown";
    writer.writeLine(`let ${field.name}_hashMap: Map<string, ${mapValueType}> | undefined;`);

    writer.writeLine(`if (attach_${field.name})`).block(() => {
      if (!field.isList) {
        if (field.relationFromFields?.length) {
          buildTypeAHashMap(writer, field);
        } else {
          buildTypeBHashMap(writer, field, otherField);
        }
      } else {
        buildTypeCHashMap(writer, field, otherField);
      }
    });
  });
}

/**
 * Emits variables to detect and inject missing key fields into a `select` clause.
 * `_opts`         – the full query options (or `{}` if `attach === true`)
 * `_sel`          – the `select` sub-object (or `undefined`)
 * `_keysToInject` – key fields absent from the select that must be temporarily added
 */
function emitKeyInjectionSetup(writer: CodeBlockWriter, fieldName: string, keyFields: readonly string[]) {
  const keyFieldsLiteral = `[${keyFields.map((k) => `"${k}"`).join(", ")}]`;
  writer
    .writeLine(
      `const ${fieldName}_opts = (attach_${fieldName} === true ? {} : attach_${fieldName}) as Record<string, unknown>;`
    )
    .writeLine(`const ${fieldName}_sel = ${fieldName}_opts.select as Record<string, boolean> | undefined;`)
    .writeLine(
      `const ${fieldName}_keysToInject = ${fieldName}_sel ? (${keyFieldsLiteral} as string[]).filter((k) => !${fieldName}_sel![k]) : [];`
    );
}

/**
 * Emits the spread-expression that re-applies `select` with injected key fields,
 * preserving the user's original select shape but ensuring required key fields are fetched.
 */
function selectInjectionSpread(fieldName: string): string {
  return `...(${fieldName}_keysToInject.length > 0 ? { select: { ...${fieldName}_sel, ...Object.fromEntries(${fieldName}_keysToInject.map(k => [k, true])) } } : {})`;
}

/**
 * Emits the merged `where` clause: the user's nested where (if any) AND-ed with the FK predicate.
 * Assumes a `${fieldName}_userWhere` variable is already in scope (declared via either this helper
 * with `declareUserWhere=true` or hoisted manually for branching control flow).
 * Produces `_fkWhere` and `_where` (and optionally `_userWhere`).
 */
function emitWhereMerge(
  writer: CodeBlockWriter,
  fieldName: string,
  fkWhereExpr: string,
  declareUserWhere: boolean = true
) {
  if (declareUserWhere) {
    writer.writeLine(`const ${fieldName}_userWhere = ${fieldName}_opts.where as Record<string, unknown> | undefined;`);
  }
  writer
    .writeLine(`const ${fieldName}_fkWhere = ${fkWhereExpr};`)
    .writeLine(
      `const ${fieldName}_where = ${fieldName}_userWhere ? { AND: [${fieldName}_userWhere, ${fieldName}_fkWhere] } : ${fieldName}_fkWhere;`
    );
}

/**
 * Emits an expression that strips injected key fields from a record (or returns it as-is).
 */
function strippedValueExpr(fieldName: string, recordVar: string): string {
  return `${fieldName}_keysToInject.length > 0 ? Object.fromEntries(Object.entries(${recordVar}).filter(([k]) => !${fieldName}_keysToInject.includes(k))) : ${recordVar}`;
}

/**
 * Type A: FK lives on THIS model (e.g. Post.authorId → User.id).
 * Batch-fetch the related model by PK, map key = JSON.stringify(related PK).
 */
function buildTypeAHashMap(writer: CodeBlockWriter, field: Field) {
  const fkFields = field.relationFromFields!;
  const pkFields = field.relationToFields!;

  emitKeyInjectionSetup(writer, field.name, pkFields);

  const mapKeyExpr =
    pkFields.length === 1
      ? `JSON.stringify(_r["${pkFields[0]}"])`
      : `JSON.stringify([${pkFields.map((f) => `_r["${f}"]`).join(", ")}])`;

  let fkWhereExpr: string;
  if (fkFields.length === 1) {
    writer.writeLine(
      `const ${field.name}_fkValues = [...new Set(records.map(r => r.${fkFields[0]}).filter(v => v !== null && v !== undefined))];`
    );
    fkWhereExpr = `{ ${pkFields[0]}: { in: ${field.name}_fkValues } }`;
  } else {
    fkFields.forEach((fkField, idx) => {
      writer.writeLine(
        `const ${field.name}_pk${idx}_values = [...new Set(records.map(r => r.${fkField}).filter(v => v !== null && v !== undefined))];`
      );
    });
    const whereEntries = pkFields.map((pk, idx) => `${pk}: { in: ${field.name}_pk${idx}_values }`).join(", ");
    fkWhereExpr = `{ ${whereEntries} }`;
  }

  emitWhereMerge(writer, field.name, fkWhereExpr);

  writer
    .writeLine(`const ${field.name}_related = await this.client.${toCamelCase(field.type)}.findMany(`)
    .block(() => {
      writer
        .writeLine(`...${field.name}_opts,`)
        .writeLine(`${selectInjectionSpread(field.name)},`)
        .writeLine(`where: ${field.name}_where`);
    })
    .writeLine(`, { tx });`);

  writer
    .writeLine(`${field.name}_hashMap = new Map(${field.name}_related.map((r) =>`)
    .block(() => {
      writer
        .writeLine(`const _r = r as Record<string, unknown>;`)
        .writeLine(`const key = ${mapKeyExpr};`)
        .writeLine(`const value = ${strippedValueExpr(field.name, "_r")};`)
        .writeLine(`return [key, value as unknown];`);
    })
    .writeLine(`));`);
}

/**
 * Type B: FK lives on the OTHER model, but this side is singular (1-to-1 inverse).
 * e.g. User.profile where Profile.userId is the FK.
 * Batch-fetch by FK = parentPK, map key = JSON.stringify(related FK value).
 */
function buildTypeBHashMap(writer: CodeBlockWriter, field: Field, otherField: Field) {
  const fkFields = otherField.relationFromFields!; // FK fields on the related model
  const pkFields = otherField.relationToFields!; // PK fields on THIS model

  emitKeyInjectionSetup(writer, field.name, fkFields);

  const mapKeyExpr =
    fkFields.length === 1
      ? `JSON.stringify(_r["${fkFields[0]}"])`
      : `JSON.stringify([${fkFields.map((f) => `_r["${f}"]`).join(", ")}])`;

  let fkWhereExpr: string;
  if (pkFields.length === 1) {
    writer.writeLine(`const ${field.name}_parentIds = [...new Set(records.map(r => r.${pkFields[0]}))];`);
    fkWhereExpr = `{ ${fkFields[0]}: { in: ${field.name}_parentIds } }`;
  } else {
    pkFields.forEach((pkField, idx) => {
      writer.writeLine(`const ${field.name}_pk${idx}_values = [...new Set(records.map(r => r.${pkField}))];`);
    });
    const whereEntries = fkFields.map((fk, idx) => `${fk}: { in: ${field.name}_pk${idx}_values }`).join(", ");
    fkWhereExpr = `{ ${whereEntries} }`;
  }

  emitWhereMerge(writer, field.name, fkWhereExpr);

  writer
    .writeLine(`const ${field.name}_related = await this.client.${toCamelCase(field.type)}.findMany(`)
    .block(() => {
      writer
        .writeLine(`...${field.name}_opts,`)
        .writeLine(`${selectInjectionSpread(field.name)},`)
        .writeLine(`where: ${field.name}_where`);
    })
    .writeLine(`, { tx });`);

  writer
    .writeLine(`${field.name}_hashMap = new Map(${field.name}_related.map((r) =>`)
    .block(() => {
      writer
        .writeLine(`const _r = r as Record<string, unknown>;`)
        .writeLine(`const key = ${mapKeyExpr};`)
        .writeLine(`const value = ${strippedValueExpr(field.name, "_r")};`)
        .writeLine(`return [key, value as unknown];`);
    })
    .writeLine(`));`);
}

/**
 * Type C: 1-to-many (FK on the OTHER/child model, this field is a list).
 * e.g. User.posts where Post.authorId is the FK.
 *
 * Two execution paths:
 *  - **Fast path (batch)**: one `findMany` for all parents, group by FK in JS, slice take/skip per group.
 *    User-supplied `where` is merged with the FK predicate via AND.
 *  - **Fallback (per-parent)**: when `cursor` or `distinct` is present on the relation, those options
 *    cannot be soundly applied across all parents in a single query, so we fall back to one
 *    `findMany` per parent. This sacrifices the batch optimisation only for those uncommon cases.
 */
function buildTypeCHashMap(writer: CodeBlockWriter, field: Field, otherField: Field) {
  const fkFields = otherField.relationFromFields!; // FK fields on child model
  const pkFields = otherField.relationToFields!; // PK fields on this (parent) model

  emitKeyInjectionSetup(writer, field.name, fkFields);

  const groupKeyExpr =
    fkFields.length === 1
      ? `JSON.stringify(_r["${fkFields[0]}"])`
      : `JSON.stringify([${fkFields.map((f) => `_r["${f}"]`).join(", ")}])`;

  // Capture take/skip/cursor/distinct from the user's options.
  writer
    .writeLine(`const ${field.name}_take = ${field.name}_opts.take as number | undefined;`)
    .writeLine(`const ${field.name}_skip = ${field.name}_opts.skip as number | undefined;`)
    .writeLine(`const ${field.name}_cursor = ${field.name}_opts.cursor;`)
    .writeLine(`const ${field.name}_distinct = ${field.name}_opts.distinct;`);

  // Compute parent ID buckets once (used by both code paths).
  if (pkFields.length === 1) {
    writer.writeLine(`const ${field.name}_parentIds = [...new Set(records.map(r => r.${pkFields[0]}))];`);
  } else {
    pkFields.forEach((pk, idx) => {
      writer.writeLine(`const ${field.name}_pk${idx}_values = [...new Set(records.map(r => r.${pk}))];`);
    });
  }

  writer.writeLine(`${field.name}_hashMap = new Map<string, unknown[]>();`);

  // Capture user where once at the outer scope so both code paths can AND-merge with it.
  writer.writeLine(`const ${field.name}_userWhere = ${field.name}_opts.where as Record<string, unknown> | undefined;`);

  // ---- Fallback path: per-parent loop when cursor or distinct is present. ----
  writer
    .writeLine(`if (${field.name}_cursor !== undefined || ${field.name}_distinct !== undefined)`)
    .block(() => {
      emitTypeCPerParentFallback(writer, field, otherField);
    })
    .writeLine(`else`)
    .block(() => {
      emitTypeCBatchPath(writer, field, fkFields, pkFields, groupKeyExpr);
    });
}

function emitTypeCPerParentFallback(writer: CodeBlockWriter, field: Field, otherField: Field) {
  const fkFields = otherField.relationFromFields!;
  const pkFields = otherField.relationToFields!;

  if (pkFields.length === 1) {
    writer.writeLine(`for (const parentId of ${field.name}_parentIds)`).block(() => {
      writer
        .writeLine(`const ${field.name}_perParentFkWhere = { ${fkFields[0]}: parentId };`)
        .writeLine(
          `const ${field.name}_perParentWhere = ${field.name}_userWhere ? { AND: [${field.name}_userWhere, ${field.name}_perParentFkWhere] } : ${field.name}_perParentFkWhere;`
        )
        .writeLine(`const children = await this.client.${toCamelCase(field.type)}.findMany(`)
        .block(() => {
          writer
            .writeLine(`...${field.name}_opts,`)
            .writeLine(`${selectInjectionSpread(field.name)},`)
            .writeLine(`where: ${field.name}_perParentWhere`);
        })
        .writeLine(`, { tx });`)
        .writeLine(`const stripped = children.map((c) =>`)
        .block(() => {
          writer
            .writeLine(`const _r = c as Record<string, unknown>;`)
            .writeLine(`return ${strippedValueExpr(field.name, "_r")};`);
        })
        .writeLine(`);`)
        .writeLine(`${field.name}_hashMap!.set(JSON.stringify(parentId), stripped as unknown[]);`);
    });
  } else {
    // Composite parent PK: zip the per-component arrays back into per-parent tuples.
    writer.writeLine(`for (const parent of records)`).block(() => {
      const fkAssignments = fkFields.map((fk, idx) => `${fk}: parent.${pkFields[idx]}`).join(", ");
      const keyParts = pkFields.map((p) => `parent.${p}`).join(", ");
      writer
        .writeLine(`const ${field.name}_perParentFkWhere = { ${fkAssignments} };`)
        .writeLine(
          `const ${field.name}_perParentWhere = ${field.name}_userWhere ? { AND: [${field.name}_userWhere, ${field.name}_perParentFkWhere] } : ${field.name}_perParentFkWhere;`
        )
        .writeLine(`const children = await this.client.${toCamelCase(field.type)}.findMany(`)
        .block(() => {
          writer
            .writeLine(`...${field.name}_opts,`)
            .writeLine(`${selectInjectionSpread(field.name)},`)
            .writeLine(`where: ${field.name}_perParentWhere`);
        })
        .writeLine(`, { tx });`)
        .writeLine(`const stripped = children.map((c) =>`)
        .block(() => {
          writer
            .writeLine(`const _r = c as Record<string, unknown>;`)
            .writeLine(`return ${strippedValueExpr(field.name, "_r")};`);
        })
        .writeLine(`);`)
        .writeLine(`${field.name}_hashMap!.set(JSON.stringify([${keyParts}]), stripped as unknown[]);`);
    });
  }
}

function emitTypeCBatchPath(
  writer: CodeBlockWriter,
  field: Field,
  fkFields: readonly string[],
  pkFields: readonly string[],
  groupKeyExpr: string
) {
  const fkWhereExpr =
    pkFields.length === 1
      ? `{ ${fkFields[0]}: { in: ${field.name}_parentIds } }`
      : `{ ${fkFields.map((fk, idx) => `${fk}: { in: ${field.name}_pk${idx}_values }`).join(", ")} }`;

  emitWhereMerge(writer, field.name, fkWhereExpr, false);

  // Strip take/skip — applied per-group below to preserve per-parent semantics.
  writer
    .writeLine(`const ${field.name}_allRelated = await this.client.${toCamelCase(field.type)}.findMany(`)
    .block(() => {
      writer
        .writeLine(`...${field.name}_opts,`)
        .writeLine(`${selectInjectionSpread(field.name)},`)
        .writeLine(`take: undefined,`)
        .writeLine(`skip: undefined,`)
        .writeLine(`where: ${field.name}_where`);
    })
    .writeLine(`, { tx });`);

  // Group by FK value.
  writer.writeLine(`for (const related of ${field.name}_allRelated)`).block(() => {
    writer
      .writeLine(`const _r = related as Record<string, unknown>;`)
      .writeLine(`const key = ${groupKeyExpr};`)
      .writeLine(`if (!${field.name}_hashMap!.has(key)) ${field.name}_hashMap!.set(key, []);`)
      .writeLine(`const value = ${strippedValueExpr(field.name, "_r")};`)
      .writeLine(`${field.name}_hashMap!.get(key)!.push(value as unknown);`);
  });

  // Apply take/skip per group, mirroring `findMany`'s sign-aware semantics.
  writer.writeLine(`if (${field.name}_skip !== undefined || ${field.name}_take !== undefined)`).block(() => {
    writer.writeLine(`for (const [key, group] of ${field.name}_hashMap!)`).block(() => {
      writer
        .writeLine(`let sliced = group;`)
        .writeLine(`if (${field.name}_skip !== undefined) sliced = sliced.slice(${field.name}_skip);`)
        .writeLine(
          `if (${field.name}_take !== undefined) sliced = ${field.name}_take < 0 ? sliced.slice(${field.name}_take) : sliced.slice(0, ${field.name}_take);`
        )
        .writeLine(`${field.name}_hashMap!.set(key, sliced);`);
    });
  });
}

// ---------------------------------------------------------------------------
// ASSIGN PHASE: synchronous map over records using pre-built hash maps
// ---------------------------------------------------------------------------

function addHashJoinAssignPhase(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  const relationFields = model.fields.filter(({ kind }) => kind === "object");
  const allFields = models.flatMap(({ fields }) => fields);

  writer
    .writeLine("const recordsWithRelations = records.map((record) =>")
    .block(() => {
      writer.writeLine("const unsafeRecord = record as Record<string, unknown>;");
      relationFields.forEach((field) => {
        const otherField = allFields.find((_field) => _field.relationName === field.relationName && field !== _field)!;
        writer.writeLine(`if (attach_${field.name})`).block(() => {
          if (!field.isList) {
            if (field.relationFromFields?.length) {
              assignTypeARecord(writer, field);
            } else {
              assignTypeBRecord(writer, field, otherField);
            }
          } else {
            assignTypeCRecords(writer, field, otherField);
          }
        });
      });
      writer.writeLine("return unsafeRecord;");
    })
    .writeLine(");");
}

function assignTypeARecord(writer: CodeBlockWriter, field: Field) {
  const fkFields = field.relationFromFields!;
  const lookupKey =
    fkFields.length === 1
      ? `JSON.stringify(record.${fkFields[0]})`
      : `JSON.stringify([${fkFields.map((f) => `record.${f}`).join(", ")}])`;

  if (!field.isRequired) {
    writer.writeLine(
      `unsafeRecord['${field.name}'] = record.${fkFields[0]} === null ? null : (${field.name}_hashMap!.get(${lookupKey}) ?? null);`
    );
  } else {
    writer.writeLine(`unsafeRecord['${field.name}'] = ${field.name}_hashMap!.get(${lookupKey}) ?? null;`);
  }
}

function assignTypeBRecord(writer: CodeBlockWriter, field: Field, otherField: Field) {
  const pkFields = otherField.relationToFields!;
  const lookupKey =
    pkFields.length === 1
      ? `JSON.stringify(record.${pkFields[0]})`
      : `JSON.stringify([${pkFields.map((f) => `record.${f}`).join(", ")}])`;

  writer.writeLine(`unsafeRecord['${field.name}'] = ${field.name}_hashMap!.get(${lookupKey}) ?? null;`);
}

function assignTypeCRecords(writer: CodeBlockWriter, field: Field, otherField: Field) {
  const pkFields = otherField.relationToFields!;
  const lookupKey =
    pkFields.length === 1
      ? `JSON.stringify(record.${pkFields[0]})`
      : `JSON.stringify([${pkFields.map((f) => `record.${f}`).join(", ")}])`;

  writer.writeLine(`unsafeRecord['${field.name}'] = ${field.name}_hashMap!.get(${lookupKey}) ?? [];`);
}

function addReturn(writer: CodeBlockWriter, model: Model) {
  writer
    .write(`return recordsWithRelations as `)
    .write(`Prisma.Result<Prisma.${model.name}Delegate, Q, 'findFirstOrThrow'>[];`);
}
