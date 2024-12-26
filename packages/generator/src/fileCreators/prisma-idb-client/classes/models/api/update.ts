import { ClassDeclaration, CodeBlockWriter } from "ts-morph";
import { Field, Model } from "../../../../../fileCreators/types";
import { getUniqueIdentifiers, toCamelCase } from "../../../../../helpers/utils";

export function addUpdateMethod(modelClass: ClassDeclaration, model: Model, models: readonly Model[]) {
  modelClass.addMethod({
    name: "update",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, 'update'>` }],
    parameters: [
      { name: "query", type: "Q" },
      { name: "tx", hasQuestionToken: true, type: "IDBUtils.ReadwriteTransactionType" },
    ],
    returnType: `Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, 'update'>>`,
    statements: (writer) => {
      addGetRecord(writer, model);
      addStringUpdateHandling(writer, model);
      addDateTimeUpdateHandling(writer, model);
      addBooleanUpdateHandling(writer, model);
      addBytesUpdateHandling(writer, model);
      addIntUpdateHandling(writer, model);
      // TODO: the numeric types
      addScalarListUpdateHandling(writer, model);
      addRelationUpdateHandling(writer, model, models);
      addPutAndReturn(writer, model);
    },
  });
}

function addGetRecord(writer: CodeBlockWriter, model: Model) {
  const pk = JSON.parse(getUniqueIdentifiers(model)[0].keyPath) as string[];
  writer
    .write(`tx = tx ?? this.client._db.transaction(`)
    .write(`Array.from(this._getNeededStoresForFind(query)`)
    .write(
      `.union(this._getNeededStoresForCreate(query.data as Prisma.Args<Prisma.${model.name}Delegate, "create">["data"]))`,
    )
    .writeLine(`.union(this._getNeededStoresForFind(query))), "readwrite");`)
    .writeLine(`const record = await this.findUnique({ where: query.where }, tx);`)
    .writeLine(`if (record === null)`)
    .block(() => {
      writer.writeLine(`tx.abort();`).writeLine(`throw new Error("Record not found");`);
    })
    .writeLine(
      `const startKeyPath: PrismaIDBSchema["${model.name}"]["key"] = [${pk.map((field) => `record.${field}`)}];`,
    );
}

function addPutAndReturn(writer: CodeBlockWriter, model: Model) {
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
        writer.writeLine(`await tx.objectStore("${model.name}").delete(startKeyPath);`).writeLine(`break;`);
      });
    })
    .writeLine(`const keyPath = await tx.objectStore("${model.name}").put(record);`)
    .writeLine(`const recordWithRelations = (await this.findUnique(`)
    .block(() => {
      writer.writeLine(`where: ${whereUnique},`);
    })
    .writeLine(`, tx))!;`)
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
          handleOneToOneRelationMetaOnCurrentUpdate(writer, field);
        } else {
          handleOneToOneRelationMetaOnOtherUpdate(writer, field, otherField);
        }
      }
    });
  }
}

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
            `await this.client.${toCamelCase(field.type)}.update({ where: connectWhere, data: { ${fkFields} } }, tx);`,
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
              `await this.client.${toCamelCase(field.type)}.update({ where: connectWhere, data: { ${fkFieldsNull} } }, tx);`,
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
            .write(`as Prisma.Args<Prisma.${field.type}Delegate, "create">["data"] }, tx);`);
        });
    })
    .writeLine(`if (query.data.${field.name}.createMany)`)
    .block(() => {
      writer
        .writeLine(`await Promise.all(`)
        .writeLine(`IDBUtils.convertToArray(query.data.${field.name}.createMany.data).map(async (createData) => `)
        .block(() => {
          writer.writeLine(
            `await this.client.${toCamelCase(field.type)}.create({ data: { ...createData, ${fkFields} } }, tx);`,
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
            `await this.client.${toCamelCase(field.type)}.updateMany({ where: { ${fkFields} }, data: updateData }, tx);`,
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
            `await this.client.${toCamelCase(field.type)}.updateMany({ where: { ${fkFields} }, data: updateData }, tx);`,
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
            `await this.client.${toCamelCase(field.type)}.upsert({ ...upsertData, where: { ...upsertData.where, ${fkFields} }, create: { ...upsertData.create, ${fkFields} } as Prisma.Args<Prisma.${field.type}Delegate, "upsert">['create'] }, tx);`,
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
            `await this.client.${toCamelCase(field.type)}.delete({ where: { ...deleteData, ${fkFields} } }, tx);`,
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
            `await this.client.${toCamelCase(field.type)}.deleteMany({ where: { ...deleteData, ${fkFields} } }, tx);`,
          );
        })
        .writeLine(`))`);
    })
    .writeLine(`if (query.data.${field.name}.set)`)
    .block(() => {
      writer
        .writeLine(
          `const existing = await this.client.${toCamelCase(field.type)}.findMany({ where: { ${fkFields} } }, tx);`,
        )
        .writeLine(`if (existing.length > 0)`)
        .block(() => {
          if (otherField.isRequired) {
            writer.writeLine(`throw new Error("Cannot set required relation");`);
          } else {
            writer.writeLine(
              `await this.client.${toCamelCase(field.type)}.updateMany({ where: { ${fkFields} }, data: { ${fkFieldsNull} } }, tx);`,
            );
          }
        })
        .writeLine(`await Promise.all(`)
        .writeLine(`IDBUtils.convertToArray(query.data.${field.name}.set).map(async (setData) => `)
        .block(() => {
          writer.writeLine(
            `await this.client.${toCamelCase(field.type)}.update({ where: setData, data: { ${fkFields} } }, tx);`,
          );
        })
        .writeLine(`))`);
    });
}

function handleOneToOneRelationMetaOnCurrentUpdate(writer: CodeBlockWriter, field: Field) {
  const fkFields = `${field.relationToFields!.map((_field, idx) => `${_field}: record.${field.relationFromFields?.at(idx)}!`).join(", ")}`;

  let uniqueInput;
  if (field.relationFromFields!.length === 1) {
    uniqueInput = `${field.relationToFields!.map((_field, idx) => `${_field}: record.${field.relationFromFields?.at(idx)}!`).join(", ")}`;
  } else {
    uniqueInput = `${field.relationToFields?.join("_")} : { ${field.relationToFields?.map((_field, idx) => `${_field}: record.${field.relationFromFields?.at(idx)}`).join(", ")} }`;
  }

  writer
    .writeLine(`if (query.data.${field.name}.connect)`)
    .block(() => {
      writer.writeLine(
        `const other = await this.client.${toCamelCase(field.type)}.findUniqueOrThrow({ where: query.data.${field.name}.connect }, tx);`,
      );
      for (let i = 0; i < field.relationFromFields!.length; i++) {
        writer.writeLine(`record.${field.relationFromFields?.at(i)} = other.${field.relationToFields?.at(i)};`);
      }
    })
    .writeLine(`if (query.data.${field.name}.create)`)
    .block(() => {
      writer.writeLine(
        `const other = await this.client.${toCamelCase(field.type)}.create({ data: query.data.${field.name}.create }, tx);`,
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
          `await this.client.${toCamelCase(field.type)}.update({ where: { ...query.data.${field.name}.update.where, ${uniqueInput} }, data: updateData }, tx);`,
        );
    })
    .writeLine(`if (query.data.${field.name}.upsert)`)
    .block(() => {
      writer.writeLine(
        `await this.client.${toCamelCase(field.type)}.upsert({ where: { ...query.data.${field.name}.upsert.where, ${uniqueInput} }, create: { ...query.data.${field.name}.upsert.create, ${fkFields} } as Prisma.Args<Prisma.${field.type}Delegate, "upsert">['create'], update: query.data.${field.name}.upsert.update, }, tx);`,
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
        .writeLine(`, tx);`);
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
            `await this.client.${toCamelCase(field.type)}.delete({ where: { ...deleteWhere, ${uniqueInput} } }, tx);`,
          );
        for (const _field of field.relationFromFields!) {
          writer.writeLine(`record.${_field} = null;`);
        }
      });
  }
}

function handleOneToOneRelationMetaOnOtherUpdate(writer: CodeBlockWriter, field: Field, otherField: Field) {
  const otherFkFields = `${otherField.relationFromFields!.map((_field, idx) => `${_field}: record.${otherField.relationToFields?.at(idx)}`).join(", ")}`;
  const otherFkFieldsNull = `${otherField.relationFromFields!.map((_field) => `${_field}: null`).join(", ")}`;
  writer
    .writeLine(`if (query.data.${field.name}.connect)`)
    .block(() => {
      writer.writeLine(
        `await this.client.${toCamelCase(field.type)}.update({ where: query.data.${field.name}.connect, data: { ${otherFkFields} } }, tx);`,
      );
    })
    .writeLine(`if (query.data.${field.name}.disconnect)`)
    .block(() => {
      if (otherField.isRequired) {
        writer.writeLine(`throw new Error("Cannot disconnect required relation");`);
      } else {
        writer.writeLine(
          `await this.client.${toCamelCase(field.type)}.update({ where: query.data.${field.name}.disconnect, data: { ${otherFkFieldsNull} } }, tx);`,
        );
      }
    })
    .writeLine(`if (query.data.${field.name}.create)`)
    .block(() => {
      writer.writeLine(
        `await this.client.${toCamelCase(field.type)}.create({ data: { ...query.data.${field.name}.create, ${otherFkFields} } as Prisma.Args<Prisma.${field.type}Delegate, "create">["data"] }, tx);`,
      );
    })
    .writeLine(`if (query.data.${field.name}.delete)`)
    .block(() => {
      writer
        .writeLine(
          `const deleteWhere = query.data.${field.name}.delete === true ? {} : query.data.${field.name}.delete;`,
        )
        .writeLine(
          `await this.client.${toCamelCase(field.type)}.delete({ where: { ...deleteWhere, ${otherFkFields} } as Prisma.${field.type}WhereUniqueInput }, tx);`,
        );
    })
    .writeLine(`if (query.data.${field.name}.update)`)
    .block(() => {
      writer
        .writeLine(`const updateData = query.data.${field.name}.update.data ?? query.data.${field.name}.update;`)
        .writeLine(
          `await this.client.${toCamelCase(field.type)}.update({ where: { ...query.data.${field.name}.update.where, ${otherFkFields} } as Prisma.${field.type}WhereUniqueInput, data: updateData }, tx);`,
        );
    })
    .writeLine(`if (query.data.${field.name}.upsert)`)
    .block(() => {
      writer.writeLine(
        `await this.client.${toCamelCase(field.type)}.upsert({ ...query.data.${field.name}.upsert, where: { ...query.data.${field.name}.upsert.where, ${otherFkFields} } as Prisma.${field.type}WhereUniqueInput, create: { ...query.data.${field.name}.upsert.create, ${otherFkFields} } as Prisma.Args<Prisma.${field.type}Delegate, "upsert">['create'] }, tx);`,
      );
    })
    .writeLine(`if (query.data.${field.name}.connectOrCreate)`)
    .block(() => {
      writer.writeLine(
        `await this.client.${toCamelCase(field.type)}.upsert({ where: { ...query.data.${field.name}.connectOrCreate.where, ${otherFkFields} } as Prisma.${field.type}WhereUniqueInput, create: { ...query.data.${field.name}.connectOrCreate.create, ${otherFkFields} } as Prisma.Args<Prisma.${field.type}Delegate, "upsert">['create'], update: { ${otherFkFields} } }, tx);`,
      );
    });
}
