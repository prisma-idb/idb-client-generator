import CodeBlockWriter from "code-block-writer";
import { Field, Model } from "../../../../../fileCreators/types";
import { getUniqueIdentifiers, toCamelCase } from "../../../../../helpers/utils";
import { getOptionsParameterWrite, getOptionsSetupWrite } from "../helpers/methodOptions";

/**
 * Emits an async `update` method for the given model's Prisma delegate into the provided writer.
 *
 * The generated method accepts a Prisma update query and an options object ({ tx?, silent?, addToOutbox? }),
 * initializes option handling, loads the existing record, applies scalar and relation update handlers,
 * validates foreign keys, persists changes, updates referential relationships, emits update events, and
 * returns the updated record result.
 *
 * @param writer - CodeBlockWriter used to write the method source
 * @param model - Model metadata for which the update method is generated
 * @param models - All models in the schema (used to resolve relations and referential updates)
 */
export function addUpdateMethod(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  writer
    .writeLine(`async update<Q extends Prisma.Args<Prisma.${model.name}Delegate, "update">>(`)
    .writeLine(`query: Q,`)
    .write(getOptionsParameterWrite())
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "update">>`)
    .block(() => {
      writer.write(getOptionsSetupWrite());
      addGetRecord(writer, model);
      addStringUpdateHandling(writer, model);
      addDateTimeUpdateHandling(writer, model);
      addBooleanUpdateHandling(writer, model);
      addBytesUpdateHandling(writer, model);
      addIntUpdateHandling(writer, model);
      addBigIntUpdateHandling(writer, model);
      addFloatUpdateHandling(writer, model);
      addEnumUpdateHandling(writer, model);
      // TODO: decimal, json
      addScalarListUpdateHandling(writer, model);
      addRelationUpdateHandling(writer, model, models);
      addFkValidation(writer, model, models);
      addPutAndReturn(writer, model, models);
    });
}

/**
 * Emits code that initializes a read/write transaction if missing, loads the current model record by the provided query, aborts and throws if not found, and sets `startKeyPath` to the record's primary key values.
 *
 * @param writer - CodeBlockWriter used to emit the update method code
 * @param model - Model whose primary key fields are used to build `startKeyPath`
 */
function addGetRecord(writer: CodeBlockWriter, model: Model) {
  const pk = JSON.parse(getUniqueIdentifiers(model)[0].keyPath) as string[];
  writer
    .write(`tx = tx ?? this.client._db.transaction(`)
    .writeLine(`Array.from(this._getNeededStoresForUpdate(query)), "readwrite");`)
    .writeLine(`const record = await this.findUnique({ where: query.where }, { tx });`)
    .writeLine(`if (record === null)`)
    .block(() => {
      writer.writeLine(`tx.abort();`).writeLine(`throw new Error("Record not found");`);
    })
    .writeLine(
      `const startKeyPath: PrismaIDBSchema["${model.name}"]["key"] = [${pk.map((field) => `record.${field}`)}];`,
    );
}

/**
 * Generate code that persists an updated record, reconciles primary-key changes, emits an update event, updates referential integrity, and returns the updated record with relations.
 *
 * The generated code:
 * - Computes the record's end key path and, if any primary-key component changed, ensures no conflicting record exists, deletes the old entry, and stops further key-path comparison.
 * - Persists the updated record to the model's object store and emits an "update" event with the appropriate options.
 * - Applies referential updates to other models that reference this model.
 * - Reads and returns the updated record including its relations using a unique where clause derived from the model's primary key.
 */
function addPutAndReturn(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  const pk = JSON.parse(getUniqueIdentifiers(model)[0].keyPath) as string[];
  const whereUnique =
    pk.length === 1
      ? `{ ${pk[0]}: keyPath[0] }`
      : `{ ${pk.join("_")}: { ${pk.map((field, idx) => `${field}: keyPath[${idx}]`).join(", ")} } }`;

  writer
    .writeLine(`const endKeyPath: PrismaIDBSchema["${model.name}"]["key"] = [${pk.map((field) => `record.${field}`)}];`)
    .writeLine(`for (let i = 0; i < startKeyPath.length; i++)`)
    .block(() => {
      writer.writeLine(`if (startKeyPath[i] !== endKeyPath[i])`).block(() => {
        writer
          .writeLine(`if (await tx.objectStore("${model.name}").get(endKeyPath) !== undefined)`)
          .block(() => {
            writer.writeLine(`throw new Error("Record with the same keyPath already exists");`);
          })
          .writeLine(`await tx.objectStore("${model.name}").delete(startKeyPath);`)
          .writeLine(`break;`);
      });
    })
    .writeLine(`const keyPath = await tx.objectStore("${model.name}").put(record);`)
    .writeLine(`await this.emit("update", keyPath, startKeyPath, record, silent, addToOutbox);`);

  addReferentialUpdateHandling(writer, model, models);
  writer
    .writeLine(`const recordWithRelations = (await this.findUnique(`)
    .block(() => {
      writer.writeLine(`where: ${whereUnique},`);
    })
    .writeLine(`, { tx }))!;`)
    .writeLine(`return recordWithRelations as Prisma.Result<Prisma.${model.name}Delegate, Q, "update">;`);
}

function addStringUpdateHandling(writer: CodeBlockWriter, model: Model) {
  const stringFields = model.fields.filter((field) => field.type === "String" && !field.isList).map(({ name }) => name);
  if (stringFields.length === 0) return;

  writer
    .writeLine(`const stringFields = ${JSON.stringify(stringFields)} as const;`)
    .writeLine(`for (const field of stringFields)`)
    .block(() => {
      writer.writeLine(`IDBUtils.handleStringUpdateField(record, field, query.data[field]);`);
    });
}

function addIntUpdateHandling(writer: CodeBlockWriter, model: Model) {
  const intFields = model.fields.filter((field) => field.type === "Int" && !field.isList).map(({ name }) => name);
  if (intFields.length === 0) return;

  writer
    .writeLine(`const intFields = ${JSON.stringify(intFields)} as const;`)
    .writeLine(`for (const field of intFields)`)
    .block(() => {
      writer.writeLine(`IDBUtils.handleIntUpdateField(record, field, query.data[field]);`);
    });
}

function addBigIntUpdateHandling(writer: CodeBlockWriter, model: Model) {
  const bigIntFields = model.fields.filter((field) => field.type === "BigInt" && !field.isList).map(({ name }) => name);
  if (bigIntFields.length === 0) return;

  writer
    .writeLine(`const bigIntFields = ${JSON.stringify(bigIntFields)} as const;`)
    .writeLine(`for (const field of bigIntFields)`)
    .block(() => {
      writer.writeLine(`IDBUtils.handleBigIntUpdateField(record, field, query.data[field]);`);
    });
}

function addFloatUpdateHandling(writer: CodeBlockWriter, model: Model) {
  const floatFields = model.fields.filter((field) => field.type === "Float" && !field.isList).map(({ name }) => name);
  if (floatFields.length === 0) return;

  writer
    .writeLine(`const floatFields = ${JSON.stringify(floatFields)} as const;`)
    .writeLine(`for (const field of floatFields)`)
    .block(() => {
      writer.writeLine(`IDBUtils.handleFloatUpdateField(record, field, query.data[field]);`);
    });
}

function addDateTimeUpdateHandling(writer: CodeBlockWriter, model: Model) {
  const dateTimeFields = model.fields
    .filter((field) => field.type === "DateTime" && !field.isList)
    .map(({ name }) => name);
  if (dateTimeFields.length === 0) return;

  writer
    .writeLine(`const dateTimeFields = ${JSON.stringify(dateTimeFields)} as const;`)
    .writeLine(`for (const field of dateTimeFields)`)
    .block(() => {
      writer.writeLine(`IDBUtils.handleDateTimeUpdateField(record, field, query.data[field]);`);
    });
}

function addBooleanUpdateHandling(writer: CodeBlockWriter, model: Model) {
  const booleanFields = model.fields
    .filter((field) => field.type === "Boolean" && !field.isList)
    .map(({ name }) => name);
  if (booleanFields.length === 0) return;

  writer
    .writeLine(`const booleanFields = ${JSON.stringify(booleanFields)} as const;`)
    .writeLine(`for (const field of booleanFields)`)
    .block(() => {
      writer.writeLine(`IDBUtils.handleBooleanUpdateField(record, field, query.data[field]);`);
    });
}

function addBytesUpdateHandling(writer: CodeBlockWriter, model: Model) {
  const bytesFields = model.fields.filter((field) => field.type === "Bytes" && !field.isList).map(({ name }) => name);
  if (bytesFields.length === 0) return;

  writer
    .writeLine(`const bytesFields = ${JSON.stringify(bytesFields)} as const;`)
    .writeLine(`for (const field of bytesFields)`)
    .block(() => {
      writer.writeLine(`IDBUtils.handleBytesUpdateField(record, field, query.data[field]);`);
    });
}

function addScalarListUpdateHandling(writer: CodeBlockWriter, model: Model) {
  const listFields = model.fields.filter((field) => field.isList && field.kind !== "object").map(({ name }) => name);
  if (listFields.length === 0) return;

  writer
    .writeLine(`const listFields = ${JSON.stringify(listFields)} as const;`)
    .writeLine(`for (const field of listFields)`)
    .block(() => {
      writer.writeLine(`IDBUtils.handleScalarListUpdateField(record, field, query.data[field]);`);
    });
}

function addEnumUpdateHandling(writer: CodeBlockWriter, model: Model) {
  const enumFields = model.fields.filter((field) => field.kind === "enum" && !field.isList).map(({ name }) => name);
  if (enumFields.length === 0) return;

  writer
    .writeLine(`const enumFields = ${JSON.stringify(enumFields)} as const;`)
    .writeLine(`for (const field of enumFields)`)
    .block(() => {
      writer.writeLine(`IDBUtils.handleEnumUpdateField(record, field, query.data[field]);`);
    });
}

function addRelationUpdateHandling(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  const relationFields = model.fields.filter((field) => field.kind === "object");

  for (const field of relationFields) {
    const otherField = models
      .flatMap(({ fields }) => fields)
      .find((f) => f !== field && f.relationName === field.relationName)!;
    writer.writeLine(`if (query.data.${field.name})`).block(() => {
      if (field.isList) {
        handleOneToManyRelationUpdate(writer, field, otherField);
      } else {
        if (field.relationFromFields?.length) {
          handleOneToOneRelationMetaOnCurrentUpdate(writer, field, models);
        } else {
          handleOneToOneRelationMetaOnOtherUpdate(writer, field, otherField);
        }
      }
    });
  }
}

/**
 * Emits code that applies update operations for a one-to-many relation field.
 *
 * Generates code handling connect, disconnect, create, createMany, update, updateMany,
 * upsert, delete, deleteMany, and set operations on the related model so that foreign
 * keys on the related records are synchronized with the current record.
 *
 * @param writer - The code writer used to emit TypeScript statements.
 * @param field - The relation field on the current model representing the one-to-many relation.
 * @param otherField - The corresponding field on the related model that stores the foreign key(s) referencing the current model.
 */
function handleOneToManyRelationUpdate(writer: CodeBlockWriter, field: Field, otherField: Field) {
  const fkFields = `${otherField.relationFromFields!.map((_field, idx) => `${_field}: record.${otherField.relationToFields?.at(idx)}`).join(", ")}`;
  const fkFieldsNull = `${otherField.relationFromFields!.map((_field) => `${_field}: null`).join(", ")}`;

  writer
    .writeLine(`if (query.data.${field.name}.connect)`)
    .block(() => {
      writer
        .writeLine(`await Promise.all(`)
        .writeLine(`IDBUtils.convertToArray(query.data.${field.name}.connect).map(async (connectWhere) => `)
        .block(() => {
          writer.writeLine(
            `await this.client.${toCamelCase(field.type)}.update({ where: connectWhere, data: { ${fkFields} } }, { tx, silent, addToOutbox });`,
          );
        })
        .writeLine(`))`);
    })
    .writeLine(`if (query.data.${field.name}.disconnect)`)
    .block(() => {
      if (otherField.isRequired) {
        writer.writeLine(`throw new Error("Cannot disconnect required relation");`);
      } else {
        writer
          .writeLine(`await Promise.all(`)
          .writeLine(`IDBUtils.convertToArray(query.data.${field.name}.disconnect).map(async (connectWhere) => `)
          .block(() => {
            writer.writeLine(
              `await this.client.${toCamelCase(field.type)}.update({ where: connectWhere, data: { ${fkFieldsNull} } }, { tx, silent, addToOutbox });`,
            );
          })
          .writeLine(`))`);
      }
    })
    .writeLine(`if (query.data.${field.name}.create)`)
    .block(() => {
      writer
        .writeLine(`const createData = Array.isArray(query.data.${field.name}.create)`)
        .writeLine(`? query.data.${field.name}.create`)
        .writeLine(`: [query.data.${field.name}.create];`)
        .writeLine(`for (const elem of createData)`)
        .block(() => {
          writer
            .write(`await this.client.${toCamelCase(field.type)}.create({ data: { ...elem, ${fkFields} }`)
            .write(`as Prisma.Args<Prisma.${field.type}Delegate, "create">["data"] }, { tx, silent, addToOutbox });`);
        });
    })
    .writeLine(`if (query.data.${field.name}.createMany)`)
    .block(() => {
      writer
        .writeLine(`await Promise.all(`)
        .writeLine(`IDBUtils.convertToArray(query.data.${field.name}.createMany.data).map(async (createData) => `)
        .block(() => {
          writer.writeLine(
            `await this.client.${toCamelCase(field.type)}.create({ data: { ...createData, ${fkFields} } }, { tx, silent, addToOutbox });`,
          );
        })
        .writeLine(`))`);
    })
    .writeLine(`if (query.data.${field.name}.update)`)
    .block(() => {
      writer
        .writeLine(`await Promise.all(`)
        .writeLine(`IDBUtils.convertToArray(query.data.${field.name}.update).map(async (updateData) => `)
        .block(() => {
          writer.writeLine(
            `await this.client.${toCamelCase(field.type)}.update(updateData, { tx, silent, addToOutbox });`,
          );
        })
        .writeLine(`))`);
    })
    .writeLine(`if (query.data.${field.name}.updateMany)`)
    .block(() => {
      writer
        .writeLine(`await Promise.all(`)
        .writeLine(`IDBUtils.convertToArray(query.data.${field.name}.updateMany).map(async (updateData) => `)
        .block(() => {
          writer.writeLine(
            `await this.client.${toCamelCase(field.type)}.updateMany(updateData, { tx, silent, addToOutbox });`,
          );
        })
        .writeLine(`))`);
    })
    .writeLine(`if (query.data.${field.name}.upsert)`)
    .block(() => {
      writer
        .writeLine(`await Promise.all(`)
        .writeLine(`IDBUtils.convertToArray(query.data.${field.name}.upsert).map(async (upsertData) => `)
        .block(() => {
          writer.writeLine(
            `await this.client.${toCamelCase(field.type)}.upsert({ ...upsertData, where: { ...upsertData.where, ${fkFields} }, create: { ...upsertData.create, ${fkFields} } as Prisma.Args<Prisma.${field.type}Delegate, "upsert">['create'] }, { tx, silent, addToOutbox });`,
          );
        })
        .writeLine(`))`);
    })
    .writeLine(`if (query.data.${field.name}.delete)`)
    .block(() => {
      writer
        .writeLine(`await Promise.all(`)
        .writeLine(`IDBUtils.convertToArray(query.data.${field.name}.delete).map(async (deleteData) => `)
        .block(() => {
          writer.writeLine(
            `await this.client.${toCamelCase(field.type)}.delete({ where: { ...deleteData, ${fkFields} } }, { tx, silent, addToOutbox });`,
          );
        })
        .writeLine(`))`);
    })
    .writeLine(`if (query.data.${field.name}.deleteMany)`)
    .block(() => {
      writer
        .writeLine(`await Promise.all(`)
        .writeLine(`IDBUtils.convertToArray(query.data.${field.name}.deleteMany).map(async (deleteData) => `)
        .block(() => {
          writer.writeLine(
            `await this.client.${toCamelCase(field.type)}.deleteMany({ where: { ...deleteData, ${fkFields} } }, { tx, silent, addToOutbox });`,
          );
        })
        .writeLine(`))`);
    })
    .writeLine(`if (query.data.${field.name}.set)`)
    .block(() => {
      writer
        .writeLine(
          `const existing = await this.client.${toCamelCase(field.type)}.findMany({ where: { ${fkFields} } }, { tx });`,
        )
        .writeLine(`if (existing.length > 0)`)
        .block(() => {
          if (otherField.isRequired) {
            writer.writeLine(`throw new Error("Cannot set required relation");`);
          } else {
            writer.writeLine(
              `await this.client.${toCamelCase(field.type)}.updateMany({ where: { ${fkFields} }, data: { ${fkFieldsNull} } }, { tx, silent, addToOutbox });`,
            );
          }
        })
        .writeLine(`await Promise.all(`)
        .writeLine(`IDBUtils.convertToArray(query.data.${field.name}.set).map(async (setData) => `)
        .block(() => {
          writer.writeLine(
            `await this.client.${toCamelCase(field.type)}.update({ where: setData, data: { ${fkFields} } }, { tx, silent, addToOutbox });`,
          );
        })
        .writeLine(`))`);
    });
}

/**
 * Apply updates for a one-to-one relation where the current model owns the relation and propagate foreign key changes to the in-memory record.
 *
 * Handles `connect`, `create`, `update`, `upsert`, and `connectOrCreate` operations for the related entity by invoking the related model's client methods and copying that entity's key fields onto the current record's relation-from fields. If the relation is optional, also handles `disconnect` and `delete` by clearing the current record's foreign key fields and deleting the related entity when requested.
 *
 * @param writer - CodeBlockWriter used to emit generated update-handling code
 * @param field - Relation field metadata describing relationFromFields/relationToFields and cardinality
 * @param models - All models in the schema, used to resolve composite unique identifiers when building unique input objects
 */
function handleOneToOneRelationMetaOnCurrentUpdate(writer: CodeBlockWriter, field: Field, models: readonly Model[]) {
  const fkFields = `${field.relationToFields!.map((_field, idx) => `${_field}: record.${field.relationFromFields?.at(idx)}!`).join(", ")}`;

  let uniqueInput;
  if (field.relationFromFields!.length === 1) {
    uniqueInput = `${field.relationToFields!.map((_field, idx) => `${_field}: record.${field.relationFromFields?.at(idx)}!`).join(", ")}`;
  } else {
    const otherModel = models.find((model) => model.name === field.type)!;
    const otherModelKeyPath = JSON.parse(getUniqueIdentifiers(otherModel)[0].keyPath) as string[];
    uniqueInput = `${otherModelKeyPath.join("_")} : { ${field.relationToFields?.map((_field, idx) => `${_field}: record.${field.relationFromFields?.at(idx)}`).join(", ")} }`;
  }

  writer
    .writeLine(`if (query.data.${field.name}.connect)`)
    .block(() => {
      writer.writeLine(
        `const other = await this.client.${toCamelCase(field.type)}.findUniqueOrThrow({ where: query.data.${field.name}.connect }, { tx });`,
      );
      for (let i = 0; i < field.relationFromFields!.length; i++) {
        writer.writeLine(`record.${field.relationFromFields?.at(i)} = other.${field.relationToFields?.at(i)};`);
      }
    })
    .writeLine(`if (query.data.${field.name}.create)`)
    .block(() => {
      writer.writeLine(
        `const other = await this.client.${toCamelCase(field.type)}.create({ data: query.data.${field.name}.create }, { tx, silent, addToOutbox });`,
      );
      for (let i = 0; i < field.relationFromFields!.length; i++) {
        writer.writeLine(`record.${field.relationFromFields?.at(i)} = other.${field.relationToFields?.at(i)};`);
      }
    })
    .writeLine(`if (query.data.${field.name}.update)`)
    .block(() => {
      writer
        .writeLine(`const updateData = query.data.${field.name}.update.data ?? query.data.${field.name}.update;`)
        .writeLine(
          `await this.client.${toCamelCase(field.type)}.update({ where: { ...query.data.${field.name}.update.where, ${uniqueInput} } as Prisma.${field.type}WhereUniqueInput, data: updateData }, { tx, silent, addToOutbox });`,
        );
    })
    .writeLine(`if (query.data.${field.name}.upsert)`)
    .block(() => {
      writer.writeLine(
        `await this.client.${toCamelCase(field.type)}.upsert({ where: { ...query.data.${field.name}.upsert.where, ${uniqueInput} } as Prisma.${field.type}WhereUniqueInput, create: { ...query.data.${field.name}.upsert.create, ${fkFields} } as Prisma.Args<Prisma.${field.type}Delegate, "upsert">['create'], update: query.data.${field.name}.upsert.update, }, { tx, silent, addToOutbox });`,
      );
    })
    .writeLine(`if (query.data.${field.name}.connectOrCreate)`)
    .block(() => {
      writer
        .writeLine(`await this.client.${toCamelCase(field.type)}.upsert(`)
        .block(() => {
          writer
            .writeLine(`where: { ...query.data.${field.name}.connectOrCreate.where, ${uniqueInput} },`)
            .writeLine(
              `create: { ...query.data.${field.name}.connectOrCreate.create, ${fkFields} } as Prisma.Args<Prisma.${field.type}Delegate, "upsert">['create'],`,
            )
            .writeLine(`update: { ${fkFields} },`);
        })
        .writeLine(`, { tx, silent, addToOutbox });`);
    });

  if (!field.isRequired) {
    writer
      .writeLine(`if (query.data.${field.name}.disconnect)`)
      .block(() => {
        for (const _field of field.relationFromFields!) {
          writer.writeLine(`record.${_field} = null;`);
        }
      })
      .writeLine(`if (query.data.${field.name}.delete)`)
      .block(() => {
        writer
          .writeLine(
            `const deleteWhere = query.data.${field.name}.delete === true ? {} : query.data.${field.name}.delete;`,
          )
          .writeLine(
            `await this.client.${toCamelCase(field.type)}.delete({ where: { ...deleteWhere, ${uniqueInput} } } as Prisma.${field.type}DeleteArgs, { tx, silent, addToOutbox });`,
          );
        for (const _field of field.relationFromFields!) {
          writer.writeLine(`record.${_field} = null;`);
        }
      });
  }
}

/**
 * Emits code to synchronize the other side of a one-to-one relation when the current model's relation field is updated.
 *
 * Generates update/create/delete/upsert/connect/connectOrCreate/disconnect handlers against the related model that
 * propagate the current record's key fields into the related record's foreign key fields and enforce required-relation constraints.
 *
 * @param writer - A CodeBlockWriter used to output the generated code blocks.
 * @param field - The relation field on the current model that targets the related model.
 * @param otherField - The corresponding relation field on the related model whose foreign key fields (relationFromFields) are updated.
 */
function handleOneToOneRelationMetaOnOtherUpdate(writer: CodeBlockWriter, field: Field, otherField: Field) {
  const otherFkFields = `${otherField.relationFromFields!.map((_field, idx) => `${_field}: record.${otherField.relationToFields?.at(idx)}`).join(", ")}`;
  const otherFkFieldsNull = `${otherField.relationFromFields!.map((_field) => `${_field}: null`).join(", ")}`;
  writer
    .writeLine(`if (query.data.${field.name}.connect)`)
    .block(() => {
      writer.writeLine(
        `await this.client.${toCamelCase(field.type)}.update({ where: query.data.${field.name}.connect, data: { ${otherFkFields} } }, { tx, silent, addToOutbox });`,
      );
    })
    .writeLine(`if (query.data.${field.name}.disconnect)`)
    .block(() => {
      if (otherField.isRequired) {
        writer.writeLine(`throw new Error("Cannot disconnect required relation");`);
      } else {
        writer.writeLine(
          `await this.client.${toCamelCase(field.type)}.update({ where: query.data.${field.name}.disconnect, data: { ${otherFkFieldsNull} } }, { tx, silent, addToOutbox });`,
        );
      }
    })
    .writeLine(`if (query.data.${field.name}.create)`)
    .block(() => {
      writer.writeLine(
        `await this.client.${toCamelCase(field.type)}.create({ data: { ...query.data.${field.name}.create, ${otherFkFields} } as Prisma.Args<Prisma.${field.type}Delegate, "create">["data"] }, { tx, silent, addToOutbox });`,
      );
    })
    .writeLine(`if (query.data.${field.name}.delete)`)
    .block(() => {
      writer
        .writeLine(
          `const deleteWhere = query.data.${field.name}.delete === true ? {} : query.data.${field.name}.delete;`,
        )
        .writeLine(
          `await this.client.${toCamelCase(field.type)}.delete({ where: { ...deleteWhere, ${otherFkFields} } as Prisma.${field.type}WhereUniqueInput }, { tx, silent, addToOutbox });`,
        );
    })
    .writeLine(`if (query.data.${field.name}.update)`)
    .block(() => {
      writer
        .writeLine(`const updateData = query.data.${field.name}.update.data ?? query.data.${field.name}.update;`)
        .writeLine(
          `await this.client.${toCamelCase(field.type)}.update({ where: { ...query.data.${field.name}.update.where, ${otherFkFields} } as Prisma.${field.type}WhereUniqueInput, data: updateData }, { tx, silent, addToOutbox });`,
        );
    })
    .writeLine(`if (query.data.${field.name}.upsert)`)
    .block(() => {
      writer.writeLine(
        `await this.client.${toCamelCase(field.type)}.upsert({ ...query.data.${field.name}.upsert, where: { ...query.data.${field.name}.upsert.where, ${otherFkFields} } as Prisma.${field.type}WhereUniqueInput, create: { ...query.data.${field.name}.upsert.create, ${otherFkFields} } as Prisma.Args<Prisma.${field.type}Delegate, "upsert">['create'] }, { tx, silent, addToOutbox });`,
      );
    })
    .writeLine(`if (query.data.${field.name}.connectOrCreate)`)
    .block(() => {
      writer.writeLine(
        `await this.client.${toCamelCase(field.type)}.upsert({ where: { ...query.data.${field.name}.connectOrCreate.where, ${otherFkFields} } as Prisma.${field.type}WhereUniqueInput, create: { ...query.data.${field.name}.connectOrCreate.create, ${otherFkFields} } as Prisma.Args<Prisma.${field.type}Delegate, "upsert">['create'], update: { ${otherFkFields} } }, { tx, silent, addToOutbox });`,
      );
    });
}

/**
 * Emits code that updates foreign-key fields on models which reference the given model when its primary key changes.
 *
 * Traverses all models that hold object relations to the provided model and generates an updateMany call for each
 * referencing model to replace old key path segments with new ones when a divergence between `startKeyPath` and
 * `endKeyPath` is detected. Stops after applying updates for the first differing key path segment.
 *
 * @param writer - A CodeBlockWriter used to output the generated update logic.
 * @param model - The model whose key-path changes are being reconciled.
 * @param models - All models in the schema, used to discover and emit updates for referencing models.
 */
function addReferentialUpdateHandling(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  const modelKeyPath = JSON.parse(getUniqueIdentifiers(model)[0].keyPath) as string[];
  const getIndexOfKeyPart = (fieldName: string) => modelKeyPath.indexOf(fieldName);

  const referencingModels = models.filter((m) =>
    m.fields.some((field) => field.kind === "object" && field.type === model.name && field.relationFromFields?.length),
  );

  writer.writeLine(`for (let i = 0; i < startKeyPath.length; i++)`).block(() => {
    writer.writeLine(`if (startKeyPath[i] !== endKeyPath[i])`).block(() => {
      for (const referencingModel of referencingModels) {
        const objectField = referencingModel.fields.find((field) => field.type === model.name)!;

        const whereClause = objectField
          .relationFromFields!.map(
            (field, idx) => `${field}: startKeyPath[${getIndexOfKeyPart(objectField.relationToFields![idx])}]`,
          )
          .join(", ");
        const dataClause = objectField
          .relationFromFields!.map(
            (field, idx) => `${field}: endKeyPath[${getIndexOfKeyPart(objectField.relationToFields![idx])}]`,
          )
          .join(", ");

        writer
          .writeLine(`await this.client.${toCamelCase(referencingModel.name)}.updateMany(`)
          .block(() => {
            writer.writeLine(`where: { ${whereClause} },`).writeLine(`data: { ${dataClause} },`);
          })
          .writeLine(`, { tx, silent, addToOutbox });`);
      }
      writer.writeLine(`break;`);
    });
  });
}

/**
 * Emits code that validates foreign-key targets exist when related fields are updated.
 *
 * For each object relation on the model that uses `relationFromFields`, writes a runtime
 * check into the generated code that runs when any of the relation-from fields are present
 * in `query.data`. The check looks up the related record using the related model's unique
 * identifier built from its key path and throws an error if the related record is not found.
 * If the relation is optional, the check is skipped when the current record's relation fields
 * are null.
 *
 * @param model - The model whose update validations are being generated
 * @param models - All available models (used to locate the related model and its key path)
 */
function addFkValidation(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  const dependentModelFields = model.fields.filter(
    (field) => field.kind === "object" && field.relationFromFields?.length,
  );

  for (const dependentModelField of dependentModelFields) {
    const dependentModel = models.find(({ name }) => name === dependentModelField.type)!;
    const dependentModelKeyPath = JSON.parse(getUniqueIdentifiers(dependentModel)[0].keyPath) as string[];

    let whereUnique = `{ ${dependentModelKeyPath.at(0)}: record.${dependentModelField.relationFromFields?.at(dependentModelField.relationToFields!.indexOf(dependentModelKeyPath[0]))} }`;
    if (dependentModelKeyPath.length > 1) {
      whereUnique = `{ ${dependentModelKeyPath.join("_")}: { ${dependentModelKeyPath.map((_field, idx) => `${_field}: record.${dependentModelField.relationFromFields?.at(dependentModelField.relationToFields!.indexOf(dependentModelKeyPath[idx]))}`).join(", ")} } }`;
    }

    let condition = dependentModelField.relationFromFields
      ?.map((field) => `query.data.${field} !== undefined`)
      .join(" || ");
    if (!dependentModelField.isRequired)
      condition += ` && record.${dependentModelField.relationFromFields?.at(dependentModelField.relationToFields!.indexOf(dependentModelKeyPath[0]))} !== null`;

    writer.writeLine(`if (${condition})`).block(() => {
      writer.writeLine(
        `const related = await this.client.${toCamelCase(dependentModelField.type)}.findUnique({ where: ${whereUnique} }, { tx });`,
      );
      writer.writeLine(`if (!related) throw new Error("Related record not found");`);
    });
  }
}