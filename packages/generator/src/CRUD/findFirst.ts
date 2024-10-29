import { Model } from "src/types";
import { ClassDeclaration } from "ts-morph";

export function addFindFirstMethod(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "findFirst",
    isAsync: true,
    typeParameters: [{ name: "T", constraint: `Prisma.${model.name}FindFirstArgs` }],
    parameters: [{ name: "query?", type: "T" }],
    returnType: `Promise<Prisma.${model.name}GetPayload<T> | null>`,
    statements: (writer) => {
      // TODO: includes relations in here, use indexes
      // also consider performance overhead: use webWorkers, index utilization, compound indexes, batch processing, etc.
      writer.writeLine("return (await this.findMany(query))[0] ?? null;");
    },
  });
}
