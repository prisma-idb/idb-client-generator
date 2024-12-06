import { toCamelCase } from "../../../../../helpers/utils";
import { Model } from "../../../../../fileCreators/types";
import { ClassDeclaration, CodeBlockWriter } from "ts-morph";

export function addDeleteMethod(modelClass: ClassDeclaration, model: Model, models: readonly Model[]) {
  modelClass.addMethod({
    name: "delete",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, 'delete'>` }],
    parameters: [
      { name: "query", type: "Q" },
      {
        name: "tx",
        hasQuestionToken: true,
        type: "IDBUtils.ReadwriteTransactionType",
      },
    ],
    returnType: `Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, 'delete'>>`,
    statements: (writer) => {
      createTxAndGetRecord(writer, model, models);
      handleCascadeDeletes(writer, model, models);
      deleteAndReturnRecord(writer, model);
    },
  });
}

function createTxAndGetRecord(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  writer.writeLine(`const storesNeeded = this._getNeededStoresForFind(query);`);
  const cascadingModels = models.filter((_model) =>
    _model.fields.some((field) => field.relationOnDelete === "Cascade" && field.type === model.name),
  );
  for (const cascadeModel of cascadingModels) {
    writer.writeLine(`storesNeeded.add("${cascadeModel.name}")`);
  }

  writer
    .writeLine(`tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");`)
    .writeLine(`const record = await this.findUnique(query, tx);`)
    .writeLine(`if (!record) throw new Error("Record not found");`);
}

function handleCascadeDeletes(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  const cascadingModels = models.filter((_model) =>
    _model.fields.some((field) => field.relationOnDelete === "Cascade" && field.type === model.name),
  );
  for (const cascadeModel of cascadingModels) {
    const cascadingFks = cascadeModel.fields.filter(
      (field) => field.relationOnDelete === "Cascade" && field.type === model.name,
    );
    for (const cascadingFk of cascadingFks) {
      writer
        .write(`await this.client.${toCamelCase(cascadeModel.name)}.deleteMany(`)
        .block(() => {
          const fk = cascadingFk.relationFromFields?.at(0);
          const pk = cascadingFk.relationToFields?.at(0);
          writer.write(`where: { ${fk}: record.${pk} }`);
        })
        .writeLine(`, tx)`);
    }
  }
}

function deleteAndReturnRecord(writer: CodeBlockWriter, model: Model) {
  writer.writeLine(`await tx.objectStore("${model.name}").delete([record.id]);`).writeLine(`return record;`);
}
