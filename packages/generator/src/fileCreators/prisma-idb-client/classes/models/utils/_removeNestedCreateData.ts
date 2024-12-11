import { ClassDeclaration, CodeBlockWriter, Scope } from "ts-morph";
import { Model } from "../../../../types";

export function addRemoveNestedCreateDataMethod(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    scope: Scope.Private,
    name: "_removeNestedCreateData",
    typeParameters: [{ name: "D", constraint: `Prisma.Args<Prisma.${model.name}Delegate, "create">["data"]` }],
    parameters: [{ name: "data", type: "D" }],
    returnType: `Prisma.Result<Prisma.${model.name}Delegate, object, "findFirstOrThrow">`,
    statements: (writer) => {
      writer.writeLine(`const recordWithoutNestedCreate = structuredClone(data);`);
      addRelationProcessing(writer, model);
      writer.writeLine(
        `return recordWithoutNestedCreate as Prisma.Result<Prisma.${model.name}Delegate, object, "findFirstOrThrow">;`,
      );
    },
  });
}

function addRelationProcessing(writer: CodeBlockWriter, model: Model) {
  const relationFields = model.fields.filter(({ kind }) => kind === "object");
  relationFields.forEach((field) => {
    writer.writeLine(`delete recordWithoutNestedCreate?.${field.name};`);
  });
}
