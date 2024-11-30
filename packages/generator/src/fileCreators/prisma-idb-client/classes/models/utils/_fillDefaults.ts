import { Field, Model } from "src/fileCreators/types";
import { ClassDeclaration, CodeBlockWriter, Scope } from "ts-morph";

export function addFillDefaultsFunction(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "_fillDefaults",
    isAsync: true,
    scope: Scope.Private,
    typeParameters: [{ name: "D", constraint: `Prisma.Args<Prisma.${model.name}Delegate, "create">["data"]` }],
    parameters: [
      { name: "data", type: "D" },
      { name: "tx", hasQuestionToken: true, type: "IDBUtils.ReadwriteTransactionType" },
    ],
    returnType: `Promise<Prisma.Result<Prisma.${model.name}Delegate, object, 'findFirstOrThrow'>>`,
    statements: (writer) => {
      writer.writeLine("if (data === undefined) data = {} as NonNullable<D>;");
      model.fields
        .filter(({ kind }) => kind !== "object")
        .filter(({ hasDefaultValue, isRequired }) => hasDefaultValue || !isRequired)
        .forEach((field) => {
          writer.writeLine(`if (data.${field.name} === undefined) `).block(() => {
            if (typeof field.default === "object" && "name" in field.default) {
              if (field.default.name === "uuid(4)") {
                addUuidDefault(writer, field);
              } else if (field.default.name === "cuid") {
                addCuidDefault(writer, field);
              } else if (field.default.name === "autoincrement") {
                addAutoincrementDefault(writer, model, field);
              } else if (field.default.name === "now") {
                addNowDefault(writer, field);
              }
            } else if (field.default) {
              addDefaultValue(writer, field);
            } else if (!field.isRequired) {
              addNullAssignment(writer, field);
            }
          });
        });
      model.fields.forEach((field) => {
        if (field.type === "DateTime") {
          addDateStringToDateConverter(writer, field);
        }
        if (field.type === "BigInt") {
          addBigIntConverter(writer, field);
        }
      });
      writer.writeLine(`return data as Prisma.Result<Prisma.${model.name}Delegate, object, 'findFirstOrThrow'>;`);
    },
  });
}

function addUuidDefault(writer: CodeBlockWriter, field: Field) {
  writer.writeLine(`data.${field.name} = crypto.randomUUID();`);
}

function addCuidDefault(writer: CodeBlockWriter, field: Field) {
  writer
    .writeLine("const { createId } = await import('@paralleldrive/cuid2');")
    .writeLine(`data.${field.name} = createId();`);
}

function addAutoincrementDefault(writer: CodeBlockWriter, model: Model, field: Field) {
  writer
    .write(`const transaction = tx ?? this.client._db.transaction(["${model.name}"], "readwrite");`)
    .write(`const store = transaction.objectStore('${model.name}');`)
    .write("const cursor = await store.openCursor(null, 'prev');")
    .write(`data.${field.name} = (cursor ? Number(cursor.key) + 1 : 1);`);
}

function addDefaultValue(writer: CodeBlockWriter, field: Field) {
  if (field.isList) {
    writer.write(`data.${field.name} = ${JSON.stringify(field.default)};`);
  } else if (field.type === "String") {
    writer.write(`data.${field.name} = '${field.default}';`);
  } else {
    writer.write(`data.${field.name} = ${field.default};`);
  }
}

function addNullAssignment(writer: CodeBlockWriter, field: Field) {
  writer.write(`data.${field.name} = null;`);
}

function addNowDefault(writer: CodeBlockWriter, field: Field) {
  writer.writeLine(`data.${field.name} = new Date();`);
}

function addDateStringToDateConverter(writer: CodeBlockWriter, field: Field) {
  writer.writeLine(`if (typeof data.${field.name} === 'string')`).block(() => {
    writer.writeLine(`data.${field.name} = new Date(data.${field.name})`);
  });
}

function addBigIntConverter(writer: CodeBlockWriter, field: Field) {
  writer.writeLine(`if (typeof data.${field.name} === 'number')`).block(() => {
    writer.writeLine(`data.${field.name} = BigInt(data.${field.name})`);
  });
}
