import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getUniqueIdentifiers, toCamelCase } from "../../../../../helpers/utils";

export function addDeleteMethod(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  writer
    .writeLine(`async delete<Q extends Prisma.Args<Prisma.${model.name}Delegate, "delete">>(`)
    .writeLine(`query: Q,`)
    .writeLine(`tx?: IDBUtils.ReadwriteTransactionType,`)
    .writeLine(`silent?: boolean`)
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "delete">>`)
    .block(() => {
      createTxAndGetRecord(writer);
      handleCascadeDeletes(writer, model, models);
      deleteAndReturnRecord(writer, model);
    });
}

function createTxAndGetRecord(writer: CodeBlockWriter) {
  writer
    .writeLine(`const storesNeeded = this._getNeededStoresForFind(query);`)
    .writeLine(`this._getNeededStoresForNestedDelete(storesNeeded);`)
    .writeLine(`tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");`)
    .writeLine(`const record = await this.findUnique(query, tx);`)
    .writeLine(`if (!record) throw new Error("Record not found");`);
}

function handleCascadeDeletes(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  const cascadingModels = models.filter((_model) =>
    _model.fields.some((field) => field.type === model.name && field.relationFromFields?.length),
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
          .writeLine(`, tx)`);
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
          .writeLine(`, tx)`);
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
          .writeLine(`, tx)`);
      } else {
        writer
          .writeLine(
            `const related${cascadeModel.name} = await this.client.${toCamelCase(cascadeModel.name)}.findMany({ where: { ${whereClause} } }, tx);`,
          )
          .writeLine(
            `if (related${cascadeModel.name}.length) throw new Error("Cannot delete record, other records depend on it");`,
          );
      }
    }
  }
}

function deleteAndReturnRecord(writer: CodeBlockWriter, model: Model) {
  const pk = JSON.parse(getUniqueIdentifiers(model)[0].keyPath) as string[];
  const keyPath = pk.map((field) => `record.${field}`).join(", ");
  writer
    .writeLine(`await tx.objectStore("${model.name}").delete([${keyPath}]);`)
    .writeLine(`this.emit("delete", [${keyPath}], undefined, record, silent);`)
    .writeLine(`return record;`);
}
