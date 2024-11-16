import { Model } from "../../../../../fileCreators/types";
import { ClassDeclaration } from "ts-morph";

export function addFindFirstOrThrow(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "findFirstOrThrow",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, "findFirstOrThrow">` }],
    parameters: [{ name: "query", hasQuestionToken: true, type: "Q" }],
    returnType: `Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "findFirstOrThrow">>`,
    statements: (writer) => {
      writer
        .writeLine(`const record = await this.findFirst(query);`)
        .writeLine(`if (!record) throw new Error("Record not found");`)
        .writeLine(`return record;`);
    },
  });
}
