import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getUniqueIdentifiers } from "../../../../../helpers/utils";
import { getOptionsParameterWrite, getOptionsSetupWrite } from "../helpers/methodOptions";

export function addUpdateMany(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async updateMany<Q extends Prisma.Args<Prisma.${model.name}Delegate, "updateMany">>(`)
    .writeLine(`query: Q,`)
    .write(getOptionsParameterWrite())
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "updateMany">>`)
    .block(() => {
      writer.write(getOptionsSetupWrite());
      const pk = getUniqueIdentifiers(model)[0];
      const keyPath = JSON.parse(pk.keyPath) as string[];
      writer
        .write(`tx = tx ?? this.client._db.transaction(`)
        .writeLine(
          `Array.from(this._getNeededStoresForUpdate(query as unknown as Prisma.Args<Prisma.${model.name}Delegate, "update">)), "readwrite");`
        )
        .writeLine(`const records = await this.findMany({ where: query.where }, { tx });`)
        .writeLine(`for (const record of records)`)
        .block(() => {
          let whereUnique: string;
          if (keyPath.length === 1) {
            whereUnique = `{ ${pk.name}: record.${keyPath[0]} }`;
          } else {
            const compositeKey = keyPath.map((field) => `${field}: record.${field}`).join(", ");
            whereUnique = `{ ${pk.name}: { ${compositeKey} } }`;
          }
          writer
            .writeLine(`const updateQuery = {`)
            .writeLine(`where: ${whereUnique},`)
            .writeLine(`data: query.data,`)
            .writeLine(`} as Prisma.Args<Prisma.${model.name}Delegate, "update">;`)
            .writeLine(`await this._updateRecord(record, updateQuery, tx, { silent, addToOutbox });`);
        })
        .writeLine(`return { count: records.length };`);
    });
}
