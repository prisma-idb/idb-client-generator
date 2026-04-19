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

  if (fkFields.length === 1) {
    writer.writeLine(
      `const ${field.name}_fkValues = [...new Set(records.map(r => r.${fkFields[0]}).filter(v => v !== null && v !== undefined))];`
    );
    writer
      .writeLine(`const ${field.name}_related = await this.client.${toCamelCase(field.type)}.findMany(`)
      .block(() => {
        writer
          .writeLine(`...${field.name}_opts,`)
          .writeLine(
            `...(${field.name}_keysToInject.length > 0 ? { select: { ...${field.name}_sel, ...Object.fromEntries(${field.name}_keysToInject.map(k => [k, true])) } } : {}),`
          )
          .writeLine(`where: { ${pkFields[0]}: { in: ${field.name}_fkValues } }`);
      })
      .writeLine(`, { tx });`);
  } else {
    // composite FK – collect per-component value sets for the IN filter
    fkFields.forEach((fkField, idx) => {
      writer.writeLine(
        `const ${field.name}_pk${idx}_values = [...new Set(records.map(r => r.${fkField}).filter(v => v !== null && v !== undefined))];`
      );
    });
    const whereEntries = pkFields.map((pk, idx) => `${pk}: { in: ${field.name}_pk${idx}_values }`).join(", ");
    writer
      .writeLine(`const ${field.name}_related = await this.client.${toCamelCase(field.type)}.findMany(`)
      .block(() => {
        writer
          .writeLine(`...${field.name}_opts,`)
          .writeLine(
            `...(${field.name}_keysToInject.length > 0 ? { select: { ...${field.name}_sel, ...Object.fromEntries(${field.name}_keysToInject.map(k => [k, true])) } } : {}),`
          )
          .writeLine(`where: { ${whereEntries} }`);
      })
      .writeLine(`, { tx });`);
  }

  writer
    .writeLine(`${field.name}_hashMap = new Map(${field.name}_related.map((r) =>`)
    .block(() => {
      writer
        .writeLine(`const _r = r as Record<string, unknown>;`)
        .writeLine(`const key = ${mapKeyExpr};`)
        .writeLine(
          `const value = ${field.name}_keysToInject.length > 0 ? Object.fromEntries(Object.entries(_r).filter(([k]) => !${field.name}_keysToInject.includes(k))) : _r;`
        )
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

  if (pkFields.length === 1) {
    writer.writeLine(`const ${field.name}_parentIds = [...new Set(records.map(r => r.${pkFields[0]}))];`);
    writer
      .writeLine(`const ${field.name}_related = await this.client.${toCamelCase(field.type)}.findMany(`)
      .block(() => {
        writer
          .writeLine(`...${field.name}_opts,`)
          .writeLine(
            `...(${field.name}_keysToInject.length > 0 ? { select: { ...${field.name}_sel, ...Object.fromEntries(${field.name}_keysToInject.map(k => [k, true])) } } : {}),`
          )
          .writeLine(`where: { ${fkFields[0]}: { in: ${field.name}_parentIds } }`);
      })
      .writeLine(`, { tx });`);
  } else {
    pkFields.forEach((pkField, idx) => {
      writer.writeLine(`const ${field.name}_pk${idx}_values = [...new Set(records.map(r => r.${pkField}))];`);
    });
    const whereEntries = fkFields.map((fk, idx) => `${fk}: { in: ${field.name}_pk${idx}_values }`).join(", ");
    writer
      .writeLine(`const ${field.name}_related = await this.client.${toCamelCase(field.type)}.findMany(`)
      .block(() => {
        writer
          .writeLine(`...${field.name}_opts,`)
          .writeLine(
            `...(${field.name}_keysToInject.length > 0 ? { select: { ...${field.name}_sel, ...Object.fromEntries(${field.name}_keysToInject.map(k => [k, true])) } } : {}),`
          )
          .writeLine(`where: { ${whereEntries} }`);
      })
      .writeLine(`, { tx });`);
  }

  writer
    .writeLine(`${field.name}_hashMap = new Map(${field.name}_related.map((r) =>`)
    .block(() => {
      writer
        .writeLine(`const _r = r as Record<string, unknown>;`)
        .writeLine(`const key = ${mapKeyExpr};`)
        .writeLine(
          `const value = ${field.name}_keysToInject.length > 0 ? Object.fromEntries(Object.entries(_r).filter(([k]) => !${field.name}_keysToInject.includes(k))) : _r;`
        )
        .writeLine(`return [key, value as unknown];`);
    })
    .writeLine(`));`);
}

/**
 * Type C: 1-to-many (FK on the OTHER/child model, this field is a list).
 * e.g. User.posts where Post.authorId is the FK.
 * Batch-fetch all children, group by FK value, apply take/skip per group.
 */
function buildTypeCHashMap(writer: CodeBlockWriter, field: Field, otherField: Field) {
  const fkFields = otherField.relationFromFields!; // FK fields on child model
  const pkFields = otherField.relationToFields!; // PK fields on this (parent) model

  emitKeyInjectionSetup(writer, field.name, fkFields);

  const mapKeyExpr =
    fkFields.length === 1
      ? `JSON.stringify(_r["${fkFields[0]}"])`
      : `JSON.stringify([${fkFields.map((f) => `_r["${f}"]`).join(", ")}])`;

  // Batch fetch – strip take/skip so they can be applied per group below
  if (pkFields.length === 1) {
    writer.writeLine(`const ${field.name}_parentIds = [...new Set(records.map(r => r.${pkFields[0]}))];`);
    writer
      .writeLine(`const ${field.name}_allRelated = await this.client.${toCamelCase(field.type)}.findMany(`)
      .block(() => {
        writer
          .writeLine(`...${field.name}_opts,`)
          .writeLine(
            `...(${field.name}_keysToInject.length > 0 ? { select: { ...${field.name}_sel, ...Object.fromEntries(${field.name}_keysToInject.map(k => [k, true])) } } : {}),`
          )
          .writeLine(`take: undefined,`)
          .writeLine(`skip: undefined,`)
          .writeLine(`where: { ${fkFields[0]}: { in: ${field.name}_parentIds } }`);
      })
      .writeLine(`, { tx });`);
  } else {
    pkFields.forEach((pk, idx) => {
      writer.writeLine(`const ${field.name}_pk${idx}_values = [...new Set(records.map(r => r.${pk}))];`);
    });
    const whereEntries = fkFields.map((fk, idx) => `${fk}: { in: ${field.name}_pk${idx}_values }`).join(", ");
    writer
      .writeLine(`const ${field.name}_allRelated = await this.client.${toCamelCase(field.type)}.findMany(`)
      .block(() => {
        writer
          .writeLine(`...${field.name}_opts,`)
          .writeLine(
            `...(${field.name}_keysToInject.length > 0 ? { select: { ...${field.name}_sel, ...Object.fromEntries(${field.name}_keysToInject.map(k => [k, true])) } } : {}),`
          )
          .writeLine(`take: undefined,`)
          .writeLine(`skip: undefined,`)
          .writeLine(`where: { ${whereEntries} }`);
      })
      .writeLine(`, { tx });`);
  }

  // Capture take/skip for per-group slicing
  writer
    .writeLine(
      `const ${field.name}_take = attach_${field.name} !== true ? (attach_${field.name} as Prisma.${field.type}FindManyArgs).take : undefined;`
    )
    .writeLine(
      `const ${field.name}_skip = attach_${field.name} !== true ? (attach_${field.name} as Prisma.${field.type}FindManyArgs).skip : undefined;`
    );

  // Build hash map: FK value → children[]
  writer
    .writeLine(`${field.name}_hashMap = new Map<string, unknown[]>();`)
    .writeLine(`for (const related of ${field.name}_allRelated)`)
    .block(() => {
      writer
        .writeLine(`const _r = related as Record<string, unknown>;`)
        .writeLine(`const key = ${mapKeyExpr};`)
        .writeLine(`if (!${field.name}_hashMap!.has(key)) ${field.name}_hashMap!.set(key, []);`)
        .writeLine(
          `const value = ${field.name}_keysToInject.length > 0 ? Object.fromEntries(Object.entries(_r).filter(([k]) => !${field.name}_keysToInject.includes(k))) : _r;`
        )
        .writeLine(`${field.name}_hashMap!.get(key)!.push(value as unknown);`);
    });

  // Apply take/skip per group
  writer.writeLine(`if (${field.name}_skip !== undefined || ${field.name}_take !== undefined)`).block(() => {
    writer.writeLine(`for (const [key, group] of ${field.name}_hashMap!)`).block(() => {
      writer
        .writeLine(`const start = ${field.name}_skip ?? 0;`)
        .writeLine(`const end = ${field.name}_take !== undefined ? start + ${field.name}_take : undefined;`)
        .writeLine(`${field.name}_hashMap!.set(key, group.slice(start, end));`);
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
