import { Model } from "../../../../../fileCreators/types";
import { ClassDeclaration } from "ts-morph";

export function addFindFirstMethod(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "findFirst",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, 'findFirst'>` }],
    parameters: [{ name: "query", hasQuestionToken: true, type: "Q" }],
    returnType: `Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, 'findFirst'>>`,
    statements: (writer) => {
      writer.writeLine(`return (await this.findMany(query))[0];`);
    },
  });
}
