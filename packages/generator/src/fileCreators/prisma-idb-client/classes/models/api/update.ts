import { getUniqueIdentifiers } from "../../../../../helpers/utils";
import { Model } from "../../../../../fileCreators/types";
import { ClassDeclaration, CodeBlockWriter } from "ts-morph";

export function addUpdateMethod(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "update",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, 'update'>` }],
    parameters: [{ name: "query", type: "Q" }],
    returnType: `Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, 'update'>>`,
    statements: (writer) => {
      addGetRecord(writer);
      addStringUpdateHandling(writer, model);
      addDateTimeUpdateHandling(writer, model);
      addBooleanUpdateHandling(writer, model);
      addBytesUpdateHandling(writer, model);
      // TODO: the numeric types
      addPutAndReturn(writer, model);
    },
  });
}

function addGetRecord(writer: CodeBlockWriter) {
  writer
    .writeLine(`const record = await this.findUnique({ where: query.where });`)
    .writeLine(`if (record === null)`)
    .block(() => {
      writer.writeLine(`throw new Error("Record not found");`);
    });
}

function addPutAndReturn(writer: CodeBlockWriter, model: Model) {
  const pk = getUniqueIdentifiers(model)[0];
  writer
    .writeLine(`const keyPath = await this.client._db.put("${model.name}", record);`)
    .writeLine(`const recordWithRelations = (await this.findUnique(`)
    .block(() => {
      writer.writeLine(`...query, where: { ${JSON.parse(pk.keyPath)[0]}: keyPath[0] },`);
    })
    .writeLine(`))!;`)
    .writeLine(`return recordWithRelations as Prisma.Result<Prisma.${model.name}Delegate, Q, "update">;`);
}

function addStringUpdateHandling(writer: CodeBlockWriter, model: Model) {
  const stringFields = model.fields.filter((field) => field.type === "String").map(({ name }) => name);
  if (stringFields.length === 0) return;

  writer
    .writeLine(`const stringFields = ${JSON.stringify(stringFields)} as const;`)
    .writeLine(`for (const field of stringFields)`)
    .block(() => {
      writer.writeLine(`IDBUtils.handleStringUpdateField(record, field, query.data[field]);`);
    });
}

function addDateTimeUpdateHandling(writer: CodeBlockWriter, model: Model) {
  const dateTimeFields = model.fields.filter((field) => field.type === "DateTime").map(({ name }) => name);
  if (dateTimeFields.length === 0) return;

  writer
    .writeLine(`const dateTimeFields = ${JSON.stringify(dateTimeFields)} as const;`)
    .writeLine(`for (const field of dateTimeFields)`)
    .block(() => {
      writer.writeLine(`IDBUtils.handleDateTimeUpdateField(record, field, query.data[field]);`);
    });
}

function addBooleanUpdateHandling(writer: CodeBlockWriter, model: Model) {
  const booleanFields = model.fields.filter((field) => field.type === "Boolean").map(({ name }) => name);
  if (booleanFields.length === 0) return;

  writer
    .writeLine(`const booleanFields = ${JSON.stringify(booleanFields)} as const;`)
    .writeLine(`for (const field of booleanFields)`)
    .block(() => {
      writer.writeLine(`IDBUtils.handleBooleanUpdateField(record, field, query.data[field]);`);
    });
}

function addBytesUpdateHandling(writer: CodeBlockWriter, model: Model) {
  const bytesFields = model.fields.filter((field) => field.type === "Bytes").map(({ name }) => name);
  if (bytesFields.length === 0) return;

  writer
    .writeLine(`const bytesFields = ${JSON.stringify(bytesFields)} as const;`)
    .writeLine(`for (const field of bytesFields)`)
    .block(() => {
      writer.writeLine(`IDBUtils.handleBytesUpdateField(record, field, query.data[field]);`);
    });
}
