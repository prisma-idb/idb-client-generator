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
  writer
    .write(`tx = tx ?? this.client._db.transaction(`)
    .write(`Array.from(this._getNeededStoresForFind(query)`)
    .write(`.union(this._getNeededStoresForCreate(query.create))`)
    .writeLine(`.union(this._getNeededStoresForFind(query))), "readwrite");`)
    .writeLine(`let record = await this.findUnique({ where: query.where }, tx);`)
    .writeLine(`if (!record) record = await this.create({ data: query.create }, tx);`)
    .writeLine(`else record = await this.update({ where: query.where, data: query.update }, tx);`);
}

function addRefetchAndReturnRecord(writer: CodeBlockWriter, model: Model) {
  const pk = getUniqueIdentifiers(model)[0];
  const keyPath = JSON.parse(pk.keyPath) as string[];
  const hasRelations = model.fields.some(({ kind }) => kind === "object");

  let recordFindQuery = `record = await this.findUniqueOrThrow({ where: { `;
  if (keyPath.length === 1) {
    recordFindQuery += `${pk.name}: record.${keyPath[0]}`;
  } else {
    const compositeKey = keyPath.map((field) => `${field}: record.${field}`).join(", ");
    recordFindQuery += `${pk.name}: { ${compositeKey} }`;
  }
  recordFindQuery += ` }, select: query.select`;

  if (hasRelations) recordFindQuery += ", include: query.include";
  recordFindQuery += " }, tx);";

  writer
    .writeLine(recordFindQuery)
    .writeLine(`return record as Prisma.Result<Prisma.${model.name}Delegate, Q, "upsert">;`);
}
