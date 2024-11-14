import { Model } from "../../../../../fileCreators/types";
import { ClassDeclaration } from "ts-morph";

export function addFindUniqueMethod(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "findUnique",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, 'findUnique'>` }],
    parameters: [{ name: "query", hasQuestionToken: true, type: "Q" }],
    returnType: `Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, 'findUnique'>>`,
    statements: (writer) => {
      writer.writeLine(`return (await this.findMany(query))[0];`);
    },
  });
}
