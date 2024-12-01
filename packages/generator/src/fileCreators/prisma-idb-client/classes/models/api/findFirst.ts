import { Model } from "../../../../../fileCreators/types";
import { ClassDeclaration } from "ts-morph";

export function addFindFirstMethod(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "findFirst",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, 'findFirst'>` }],
    parameters: [
      { name: "query", hasQuestionToken: true, type: "Q" },
      {
        name: "tx",
        hasQuestionToken: true,
        type: "IDBUtils.ReadonlyTransactionType | IDBUtils.ReadwriteTransactionType",
      },
    ],
    returnType: `Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, 'findFirst'>>`,
    statements: (writer) => {
      writer
        .writeLine(
          `tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");`,
        )
        .writeLine(`return (await this.findMany(query))[0];`);
    },
  });
}
