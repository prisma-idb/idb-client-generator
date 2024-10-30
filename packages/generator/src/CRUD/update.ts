import { Field, Model, prismaToJsTypes } from "../types";
import { toCamelCase } from "../utils";
import { ClassDeclaration, CodeBlockWriter } from "ts-morph";

// TODO: indexes, nested select, include, where, list updates, object updates, operational updates (string, int (increment, etc))

export function addUpdateMethod(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "update",
    isAsync: true,
    typeParameters: [{ name: "T", constraint: `Prisma.${model.name}UpdateArgs` }],
    parameters: [{ name: "query", type: "T" }],
    returnType: `Promise<Prisma.${model.name}GetPayload<T> | null>`,
    statements: (writer) => {
      writer.writeLine(`const record = await this.findFirst(query);`);
      writer.writeLine(`if (record === null) return null;`);

      model.fields.forEach((field) => handleFieldUpdate(writer, field));

      writer
        .writeLine(`await this.client.db.put("${toCamelCase(model.name)}", record);`)
        .writeLine(`this.emit("update");`)
        .writeLine(`return record;`);
    },
  });
}

function handleFieldUpdate(writer: CodeBlockWriter, field: Field) {
  writer
    .writeLine(`if (query.data.${field.name} !== undefined) {`)
    .indent(() => {
      if (field.kind === "object") {
        handleObjectField(writer);
      } else if (field.isList) {
        handleListField(writer);
      } else {
        handlePrimitiveField(writer, field);
      }
    })
    .writeLine("}");
}

function handleObjectField(writer: CodeBlockWriter) {
  writer.writeLine(`throw new Error("Object updates not yet supported");`);
}

function handleListField(writer: CodeBlockWriter) {
  writer.writeLine(`throw new Error("List updates not yet supported");`);
}

function handlePrimitiveField(writer: CodeBlockWriter, field: Field) {
  const jsType = prismaToJsTypes.get(field.type);

  // TODO: handle enums
  if (!jsType) {
    writer.writeLine(`throw new Error("Unsupported type: ${field.type}")`);
    return;
  }

  writer
    .writeLine(`if (typeof query.data.${field.name} === "${jsType}") {`)
    .indent(() => {
      writer.writeLine(`record.${field.name} = query.data.${field.name};`);
    })
    .writeLine("} else {")
    .indent(() => {
      writer.writeLine(`throw new Error("Indirect updates not yet supported");`);
    })
    .writeLine("}");
}
