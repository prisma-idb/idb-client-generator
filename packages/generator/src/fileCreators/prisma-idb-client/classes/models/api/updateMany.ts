import { getUniqueIdentifiers } from "../../../../../helpers/utils";
import { Model } from "../../../../../fileCreators/types";
import { ClassDeclaration } from "ts-morph";

export function addUpdateMany(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "updateMany",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, "updateMany">` }],
    parameters: [
      { name: "query", type: "Q" },
      {
        name: "tx",
        hasQuestionToken: true,
        type: "IDBUtils.ReadwriteTransactionType",
      },
    ],
    returnType: `Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "updateMany">>`,
    statements: (writer) => {
      // TODO: composite keys
      const pk = JSON.parse(getUniqueIdentifiers(model)[0].keyPath) as string[];
      writer
        // TODO: nested create stores as well
        .writeLine(
          `tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");`,
        )
        .writeLine(`const records = await this.findMany({ where: query.where }, tx);`)
        .writeLine(`await Promise.all(`)
        .writeLine(`records.map(async (record) =>`)
        .block(() => {
          writer.writeLine(
            `await this.update({ where: { ${pk.map((field) => `${field}: record.${field},`)} }, data: query.data }, tx);`,
          );
        })
        .writeLine(`));`)
        .writeLine(`return { count: records.length };`);
    },
  });
}
