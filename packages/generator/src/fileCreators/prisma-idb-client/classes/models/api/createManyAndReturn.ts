import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getOptionsParameterWrite, getOptionsSetupWrite } from "../helpers/methodOptions";

export function addCreateManyAndReturn(
  writer: CodeBlockWriter,
  model: Model,
  outboxSync: boolean,
  outboxModelName: string,
  versionMetaModelName: string
) {
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
        .writeLine(`const storesNeeded: Set<StoreNames<PrismaIDBSchema>> = new Set(["${model.name}"]);`);
      if (outboxSync) {
        writer
          .writeLine(`if (addToOutbox !== false && this.client.shouldTrackModel(this.modelName)) {`)
          .writeLine(`storesNeeded.add("${outboxModelName}");`)
          .writeLine(`storesNeeded.add("${versionMetaModelName}");`)
          .writeLine(`}`);
      }
      writer.writeLine(`tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");`);
      if (hasAutoincrementDefault(model)) {
        // Autoincrement defaults must be assigned sequentially so each record
        // observes the previous record's id and avoids duplicate keys.
        writer.writeLine(`for (const createData of createManyData)`).block(() => {
          writer
            .writeLine(`const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));`)
            .writeLine(`const keyPath = await tx.objectStore("${model.name}").add(record);`)
            .writeLine(`await this.emit("create", keyPath, undefined, record, { silent, addToOutbox, tx });`)
            .writeLine(`records.push(this._applySelectClause([record], query.select)[0]);`);
        });
      } else {
        writer
          .writeLine(`const inserted = await Promise.all(`)
          .writeLine(`createManyData.map(async (createData) =>`)
          .block(() => {
            writer
              .writeLine(`const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));`)
              .writeLine(`const keyPath = await tx.objectStore("${model.name}").add(record);`)
              .writeLine(`await this.emit("create", keyPath, undefined, record, { silent, addToOutbox, tx });`)
              .writeLine(`return this._applySelectClause([record], query.select)[0];`);
          })
          .writeLine(`));`)
          .writeLine(`records.push(...inserted);`);
      }
      writer
        .writeLine(`this._preprocessListFields(records);`)
        .writeLine(`return records as Prisma.Result<Prisma.${model.name}Delegate, Q, "createManyAndReturn">;`);
    });
}

function hasAutoincrementDefault(model: Model): boolean {
  return model.fields.some(
    (field) =>
      typeof field.default === "object" &&
      field.default !== null &&
      "name" in field.default &&
      field.default.name === "autoincrement"
  );
}
