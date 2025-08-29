import { CodeBlockWriter } from "ts-morph";
import { Model } from "../../../../../fileCreators/types";
import { getUniqueIdentifiers } from "../../../../../helpers/utils";

export function addDeleteManyMethod(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async deleteMany<Q extends Prisma.Args<Prisma.${model.name}Delegate, "deleteMany">>(`)
    .writeLine(`query?: Q,`)
    .writeLine(`options?: `)
    .block(() => {
      writer.writeLine(`tx?: IDBUtils.ReadwriteTransactionType,`);
    })
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "deleteMany">>`)
    .block(() => {
      createTxAndGetRecord(writer);
      deleteRecords(writer, model);
      writer.writeLine(`return { count: records.length };`);
    });
}

function createTxAndGetRecord(writer: CodeBlockWriter) {
  writer
    .writeLine(`const storesNeeded = this._getNeededStoresForFind(query);`)
    .writeLine(`this._getNeededStoresForNestedDelete(storesNeeded);`)
    .writeLine(`const tx = options?.tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");`)
    .writeLine(`const records = await this.findMany(query, { tx });`);
}

function deleteRecords(writer: CodeBlockWriter, model: Model) {
  const pk = getUniqueIdentifiers(model)[0];
  const keyPath = JSON.parse(pk.keyPath) as string[];
  writer.writeLine(`for (const record of records)`).block(() => {
    if (keyPath.length === 1) {
      writer.writeLine(`await this.delete({ where: { ${pk.name}: record.${keyPath[0]} } }, { tx });`);
    } else {
      const compositeKey = keyPath.map((field) => `${field}: record.${field}`).join(", ");
      writer.writeLine(`await this.delete({ where: { ${pk.name}: { ${compositeKey} } } }, { tx });`);
    }
  });
}
