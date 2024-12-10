import { getUniqueIdentifiers } from "../../../../../helpers/utils";
import { Model } from "../../../../../fileCreators/types";
import { ClassDeclaration, CodeBlockWriter } from "ts-morph";

export function addUpsertMethod(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "upsert",
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, "upsert">` }],
    isAsync: true,
    parameters: [
      { name: "query", type: "Q" },
      { name: "tx", hasQuestionToken: true, type: "IDBUtils.ReadwriteTransactionType" },
    ],
    returnType: `Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "upsert">>`,
    statements: (writer) => {
      addGetAndUpsertRecord(writer);
      addRefetchAndReturnRecord(writer, model);
    },
  });
}

function addGetAndUpsertRecord(writer: CodeBlockWriter) {
  // TODO: add nested query things to the tx as well (nested writes to other records)
  writer
    .writeLine(`tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");`)
    .writeLine(`let record = await this.findUnique({ where: query.where }, tx);`)
    .writeLine(`if (!record) record = await this.create({ data: query.create }, tx);`)
    .writeLine(`else record = await this.update({ where: query.where, data: query.update }, tx);`);
}

function addRefetchAndReturnRecord(writer: CodeBlockWriter, model: Model) {
  // TODO: composite keys
  const pk = JSON.parse(getUniqueIdentifiers(model)[0].keyPath)[0];
  const hasRelations = model.fields.some(({ kind }) => kind === "object");

  let recordFindQuery = `record = await this.findUniqueOrThrow({ where: { ${pk}: record.${pk} }, select: query.select`;
  if (hasRelations) recordFindQuery += ", include: query.include";
  recordFindQuery += "});";

  writer
    .writeLine(recordFindQuery)
    .writeLine(`return record as Prisma.Result<Prisma.${model.name}Delegate, Q, "upsert">;`);
}
