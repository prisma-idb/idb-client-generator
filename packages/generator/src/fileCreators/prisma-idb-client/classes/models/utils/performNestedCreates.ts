import { ClassDeclaration, CodeBlockWriter, Scope } from "ts-morph";
import { Model } from "../../../../../fileCreators/types";
import { toCamelCase } from "../../../../../helpers/utils";

export function addPerformNestedCreatesMethod(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    scope: Scope.Private,
    name: "performNestedCreates",
    isAsync: true,
    typeParameters: [{ name: "D", constraint: `Prisma.Args<Prisma.${model.name}Delegate, "create">["data"]` }],
    parameters: [
      { name: "data", type: "D" },
      { name: "tx", type: "CreateTransactionType" },
    ],
    returnType: ``,
    statements: (writer) => {
      // addRelationMap(writer, model);
      // addRelationProcessing(writer);
      
      // TODO: can't use relationMap
      // TODO: each relation's attaching fieldName can be anything
      // TODO: so we need to handle each relation separately
    },
  });
}

// function addRelationMap(writer: CodeBlockWriter, model: Model) {
//   const relationFields = model.fields.filter(({ kind }) => kind === "object");
//   writer.writeLine("const relationMap = new Map([");
//   relationFields.forEach((field) => {
//     writer.writeLine(`['${field.name}', this.client.${toCamelCase(field.type)}],`);
//   });
//   writer.writeLine("] as const)");
// }

// function addRelationProcessing(writer: CodeBlockWriter) {
//   writer.writeLine(`for (const [key, value] of relationMap.entries())`).block(() => {
//     writer.writeLine(`if (data[key])`).block(() => {
//       handleConnectOrCreate(writer);
//       handleCreate(writer);
//       handleCreateMany(writer);
//     });
//   });
// }

// function handleConnectOrCreate(writer: CodeBlockWriter) {
//   writer
//     .writeLine(`if (data[key].connectOrCreate)`)
//     .block(() => writer.writeLine(`throw new Error("connectOrCreate not yet implemented");`));
// }

// function handleCreate(writer: CodeBlockWriter) {
//   writer.writeLine(`else if (data[key].create)`).block(() =>
//     writer
//       .writeLine(`await Promise.all(`)
//       .writeLine(`convertToArray(data[key].create).map(async (record) =>`)
//       .block(() => {
//         writer.writeLine(`await value.create( { data: { ...record, assignedUserId: data.userId } }, tx);`);
//       })
//       .writeLine(`)`)
//       .writeLine(`)`),
//   );
// }

// function handleCreateMany(writer: CodeBlockWriter) {
//   writer
//     .writeLine(`else if ('createMany' in data[key])`)
//     .block(() => writer.writeLine(`throw new Error("Nested createMany not yet implemented");`));
// }
