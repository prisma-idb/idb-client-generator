import { Model } from "../../../../../fileCreators/types";
import { ClassDeclaration } from "ts-morph";

export function addNestedCreateMethod(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "_nestedCreate",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, "create">` }],
    parameters: [
      { name: "query", type: "Q" },
      { name: "tx", type: "CreateTransactionType" },
    ],
    returnType: `Promise<PrismaIDBSchema['${model.name}']['key']>`,
    statements: (writer) => {
      writer
        .writeLine(`await this.performNestedCreates(query.data, tx);`)
        .writeLine(`const record = await this.fillDefaults(query.data, tx);`)
        .writeLine(`const keyPath = await tx.objectStore("${model.name}").add(record);`)
        .writeLine(`return keyPath;`);
    },
  });
}
