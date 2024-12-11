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
      const pk = getUniqueIdentifiers(model)[0];
      const keyPath = JSON.parse(pk.keyPath) as string[];
      writer
        // TODO: nested create stores as well
        .writeLine(
          `tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");`,
        )
        .writeLine(`const records = await this.findMany({ where: query.where }, tx);`)
        .writeLine(`await Promise.all(`)
        .writeLine(`records.map(async (record) =>`)
        .block(() => {
          if (keyPath.length === 1) {
            writer.writeLine(
              `await this.update({ where: { ${pk.name}: record.${keyPath[0]} }, data: query.data }, tx);`,
            );
          } else {
            const compositeKey = keyPath.map((field) => `${field}: record.${field}`).join(", ");
            writer.writeLine(
              `await this.update({ where: { ${pk.name}: { ${compositeKey} } }, data: query.data }, tx);`,
            );
          }
        })
        .writeLine(`));`)
        .writeLine(`return { count: records.length };`);
    },
  });
}
