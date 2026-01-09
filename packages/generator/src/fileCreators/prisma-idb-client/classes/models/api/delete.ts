import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getUniqueIdentifiers, toCamelCase } from "../../../../../helpers/utils";
import { getOptionsParameterWrite, getOptionsSetupWrite } from "../helpers/methodOptions";

/**
 * Writes an async `delete` method for the specified model into the given CodeBlockWriter.
 *
 * The generated method accepts a Prisma-style `query` and an optional `options` object,
 * sets up transactional context, performs cascade-aware deletes or updates on related models,
 * removes the target record, and returns the deleted record.
 *
 * @param writer - CodeBlockWriter to which the method implementation will be written
 * @param model - Metadata describing the model for which the delete method is generated
 * @param models - All available model metadata used to resolve cascading relations
 */
export function addDeleteMethod(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  writer
    .writeLine(`async delete<Q extends Prisma.Args<Prisma.${model.name}Delegate, "delete">>(`)
    .writeLine(`query: Q,`)
    .write(getOptionsParameterWrite())
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "delete">>`)
    .block(() => {
      writer.write(getOptionsSetupWrite());
      createTxAndGetRecord(writer);
      handleCascadeDeletes(writer, model, models);
      deleteAndReturnRecord(writer, model);
    });
}

/**
 * Writes code that ensures a readwrite transaction covering the stores needed for the delete and retrieves the target record, throwing if no record is found.
 *
 * @param writer - CodeBlockWriter used to emit the transaction-and-find code into the generated method
 */
function createTxAndGetRecord(writer: CodeBlockWriter) {
  writer
    .writeLine(`const storesNeeded = this._getNeededStoresForFind(query);`)
    .writeLine(`this._getNeededStoresForNestedDelete(storesNeeded);`)
    .writeLine(`tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");`)
    .writeLine(`const record = await this.findUnique(query, { tx });`)
    .writeLine(`if (!record) throw new Error("Record not found");`);
}

/**
 * Generates code that enforces cascade behavior for models that reference the given model.
 *
 * For each model that has a foreign key pointing to `model`, emits code that:
 * - deletes dependent records when the relation's `onDelete` is `"Cascade"`,
 * - updates dependent records to set referencing fields to `null` when `onDelete` is `"SetNull"` or unspecified and the FK is not required,
 * - updates dependent records to their field defaults when `onDelete` is `"SetDefault"`,
 * - otherwise checks for dependent records and emits code to throw an error if any exist.
 *
 * @param writer - CodeBlockWriter used to emit the generated code
 * @param model - The target model being deleted (dependents reference this model)
 * @param models - All available models to inspect for relationships to `model`
 */
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
            `const related${cascadeModel.name} = await this.client.${toCamelCase(cascadeModel.name)}.findMany({ where: { ${whereClause} } }, { tx });`,
          )
          .writeLine(
            `if (related${cascadeModel.name}.length) throw new Error("Cannot delete record, other records depend on it");`,
          );
      }
    }
  }
}

/**
 * Write statements that delete the current record from the model's object store, emit a delete event (including outbox flag), and return the record.
 *
 * @param writer - CodeBlockWriter used to append the generated code statements
 * @param model - Model metadata describing the target object store and its primary key fields
 */
function deleteAndReturnRecord(writer: CodeBlockWriter, model: Model) {
  const pk = JSON.parse(getUniqueIdentifiers(model)[0].keyPath) as string[];
  const keyPath = pk.map((field) => `record.${field}`).join(", ");
  writer
    .writeLine(`await tx.objectStore("${model.name}").delete([${keyPath}]);`)
    .writeLine(`await this.emit("delete", [${keyPath}], undefined, record, silent, addToOutbox);`)
    .writeLine(`return record;`);
}