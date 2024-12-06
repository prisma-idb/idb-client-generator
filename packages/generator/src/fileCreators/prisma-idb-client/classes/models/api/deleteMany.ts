import { ClassDeclaration, CodeBlockWriter } from "ts-morph";
import { Model } from "../../../../../fileCreators/types";
import { getUniqueIdentifiers } from "../../../../../helpers/utils";

export function addDeleteManyMethod(modelClass: ClassDeclaration, model: Model, models: readonly Model[]) {
  modelClass.addMethod({
    name: "deleteMany",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, 'deleteMany'>` }],
    parameters: [
      { name: "query", type: "Q" },
      {
        name: "tx",
        hasQuestionToken: true,
        type: "IDBUtils.ReadwriteTransactionType",
      },
    ],
    returnType: `Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, 'deleteMany'>>`,
    statements: (writer) => {
      createTxAndGetRecord(writer, model, models);
      deleteRecords(writer, model);
      writer.writeLine(`return { count: records.length };`);
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
    .writeLine(`const records = await this.findMany(query, tx);`);
}

function deleteRecords(writer: CodeBlockWriter, model: Model) {
  const pkOfModel = JSON.parse(getUniqueIdentifiers(model)[0].keyPath)[0];
  writer.writeLine(`for (const record of records)`).block(() => {
    writer.writeLine(`await this.delete({ where: { ${pkOfModel}: record.${pkOfModel} } }, tx);`);
  });
}
