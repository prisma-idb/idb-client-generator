import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getOptionsParameterWrite, getOptionsSetupWrite } from "../helpers/methodOptions";

export function addCreateManyAndReturn(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async createManyAndReturn<Q extends Prisma.Args<Prisma.${model.name}Delegate, "createManyAndReturn">>(`)
    .writeLine(`query: Q,`)
    .write(getOptionsParameterWrite())
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "createManyAndReturn">>`)
    .block(() => {
      writer.write(getOptionsSetupWrite());
      writer
        .writeLine(`const createManyData = IDBUtils.convertToArray(query.data);`)
        .writeLine(`const records: Prisma.Result<Prisma.${model.name}Delegate, object, "findMany"> = [];`)
        .writeLine(`tx = tx ?? this.client._db.transaction(["${model.name}"], "readwrite");`)
        .writeLine(`for (const createData of createManyData)`)
        .block(() => {
          writer
            .writeLine(`const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));`)
            .writeLine(`const keyPath = await tx.objectStore("${model.name}").add(record);`)
            .writeLine(`await this.emit("create", keyPath, undefined, record, silent, addToOutbox);`)
            .writeLine(`records.push(this._applySelectClause([record], query.select)[0]);`);
        })
        .writeLine(`this._preprocessListFields(records);`)
        .writeLine(`return records as Prisma.Result<Prisma.${model.name}Delegate, Q, "createManyAndReturn">;`);
    });
}
