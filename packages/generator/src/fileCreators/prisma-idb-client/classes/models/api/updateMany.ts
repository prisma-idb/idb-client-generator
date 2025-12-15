import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getUniqueIdentifiers } from "../../../../../helpers/utils";

export function addUpdateMany(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async updateMany<Q extends Prisma.Args<Prisma.${model.name}Delegate, "updateMany">>(`)
    .writeLine(`query: Q,`)
    .writeLine(`tx?: IDBUtils.ReadwriteTransactionType,`)
    .writeLine(`silent?: boolean`)
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "updateMany">>`)
    .block(() => {
      const pk = getUniqueIdentifiers(model)[0];
      const keyPath = JSON.parse(pk.keyPath) as string[];
      writer
        .write(`tx = tx ?? this.client._db.transaction(`)
        .writeLine(`Array.from(this._getNeededStoresForFind(query)), "readwrite");`)
        .writeLine(`const records = await this.findMany({ where: query.where }, tx);`)
        .writeLine(`await Promise.all(`)
        .writeLine(`records.map(async (record) =>`)
        .block(() => {
          if (keyPath.length === 1) {
            writer.writeLine(
              `await this.update({ where: { ${pk.name}: record.${keyPath[0]} }, data: query.data }, tx, silent);`,
            );
          } else {
            const compositeKey = keyPath.map((field) => `${field}: record.${field}`).join(", ");
            writer.writeLine(
              `await this.update({ where: { ${pk.name}: { ${compositeKey} } }, data: query.data }, tx, silent);`,
            );
          }
        })
        .writeLine(`));`)
        .writeLine(`return { count: records.length };`);
    });
}
