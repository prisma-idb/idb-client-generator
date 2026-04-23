import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getUniqueIdentifiers, toCamelCase } from "../../../../../helpers/utils";
import { getOptionsParameterWrite, getOptionsSetupWrite } from "../helpers/methodOptions";

export function addDeleteRecordInternalMethod(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  const pk = JSON.parse(getUniqueIdentifiers(model)[0].keyPath) as string[];
  const keyPath = pk.map((field) => `record.${field}`).join(", ");
  writer
    .writeLine(`private async _deleteRecord(`)
    .writeLine(`record: Prisma.Result<Prisma.${model.name}Delegate, object, "findFirstOrThrow">,`)
    .writeLine(`tx: IDBUtils.ReadwriteTransactionType,`)
    .writeLine(`options?: { silent?: boolean; addToOutbox?: boolean },`)
    .writeLine(`): Promise<void>`)
    .block(() => {
      writer.writeLine(`const { silent = false, addToOutbox = true } = options ?? {};`);
      handleCascadeDeletes(writer, model, models);
      writer
        .writeLine(`await tx.objectStore("${model.name}").delete([${keyPath}]);`)
        .writeLine(`await this.emit("delete", [${keyPath}], undefined, record, { silent, addToOutbox, tx });`);
    });
}

export function addDeleteMethod(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async delete<Q extends Prisma.Args<Prisma.${model.name}Delegate, "delete">>(`)
    .writeLine(`query: Q,`)
    .write(getOptionsParameterWrite())
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "delete">>`)
    .block(() => {
      writer.write(getOptionsSetupWrite());
      createTxAndGetRecord(writer, model);
      writer
        .writeLine(`await this._deleteRecord(recordForDelete, tx, { silent, addToOutbox });`)
        .writeLine(`return record as Prisma.Result<Prisma.${model.name}Delegate, Q, "delete">;`);
    });
}

function createTxAndGetRecord(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`const storesNeeded = this._getNeededStoresForFind(query);`)
    .writeLine(`this._getNeededStoresForNestedDelete(storesNeeded);`)
    .writeLine(`tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");`)
    .writeLine(
      `const recordForDelete = await this.findUniqueOrThrow({ where: query.where }, { tx }) as Prisma.Result<Prisma.${model.name}Delegate, object, "findFirstOrThrow">;`
    )
    // Clone before _applyRelations because that helper mutates the input
    // records by attaching relation data; we must keep recordForDelete pristine
    // so that the OutboxEvent payload emitted by _deleteRecord contains the
    // raw row instead of a hydrated one.
    .writeLine(`const projectionRecord = structuredClone(recordForDelete);`)
    .writeLine(`const recordsWithRelations = await this._applyRelations(`)
    .writeLine(`[projectionRecord],`)
    .writeLine(`tx,`)
    .writeLine(`query`)
    .writeLine(`);`)
    .writeLine(`const record = this._applySelectClause(recordsWithRelations, query.select)[0];`)
    .writeLine(`this._preprocessListFields([record]);`);
}

function handleCascadeDeletes(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  const cascadingModels = models.filter((_model) =>
    _model.fields.some((field) => field.type === model.name && field.relationFromFields?.length)
  );
  for (const cascadeModel of cascadingModels) {
    const cascadingFks = cascadeModel.fields.filter((field) => field.type === model.name);

    for (const cascadingFk of cascadingFks) {
      const whereClause = cascadingFk.relationFromFields
        ?.map((_field, idx) => `${_field}: record.${cascadingFk.relationToFields?.at(idx)}`)
        .join(", ");

      if (cascadingFk.relationOnDelete === "Cascade") {
        writer
          .write(`await this.client.${toCamelCase(cascadeModel.name)}.deleteMany(`)
          .block(() => {
            writer.write(`where: { ${whereClause} }`);
          })
          .writeLine(`, { tx, silent, addToOutbox })`);
      } else if (
        cascadingFk.relationOnDelete === "SetNull" ||
        (cascadingFk.relationOnDelete === undefined && !cascadingFk.isRequired)
      ) {
        const setNullData = cascadingFk.relationFromFields?.map((field) => `${field}: null`).join(", ");
        writer
          .write(`await this.client.${toCamelCase(cascadeModel.name)}.updateMany(`)
          .block(() => {
            writer.write(`where: { ${whereClause} }, data: { ${setNullData} }`);
          })
          .writeLine(`, { tx, silent, addToOutbox })`);
      } else if (cascadingFk.relationOnDelete === "SetDefault") {
        const setDefaultData = cascadingFk.relationFromFields
          ?.map((field) => {
            const defaultValue = cascadeModel.fields.find((_field) => _field.name === field)?.default;
            return `${field}: ${defaultValue}`;
          })
          .join(", ");
        writer
          .write(`await this.client.${toCamelCase(cascadeModel.name)}.updateMany(`)
          .block(() => {
            writer.write(`where: { ${whereClause} }, data: { ${setDefaultData} }`);
          })
          .writeLine(`, { tx, silent, addToOutbox })`);
      } else {
        writer
          .writeLine(
            `const related${cascadeModel.name} = await this.client.${toCamelCase(cascadeModel.name)}.findMany({ where: { ${whereClause} } }, { tx });`
          )
          .writeLine(`if (related${cascadeModel.name}.length)`)
          .block(() => {
            writer
              .writeLine(`tx.abort();`)
              .writeLine(`throw new Error("Cannot delete record, other records depend on it");`);
          });
      }
    }
  }
}
