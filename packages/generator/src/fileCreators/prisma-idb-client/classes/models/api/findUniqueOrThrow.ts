import { Model } from "../../../../../fileCreators/types";
import { ClassDeclaration } from "ts-morph";

export function addFindUniqueOrThrow(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "findUniqueOrThrow",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, "findUniqueOrThrow">` }],
    parameters: [{ name: "query", type: "Q" }],
    returnType: `Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "findUniqueOrThrow">>`,
    statements: (writer) => {
      writer
        .writeLine(`const record = await this.findUnique(query);`)
        .writeLine(`if (!record) throw new Error("Record not found");`)
        .writeLine(`return record;`);
    },
  });
}
