import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getUniqueIdentifiers } from "../../../../../helpers/utils";

export function addUpsertMethod(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async upsert<Q extends Prisma.Args<Prisma.${model.name}Delegate, "upsert">>(`)
    .writeLine(`query: Q,`)
    .write(`options?: {`)
    .writeLine(`tx?: IDBUtils.ReadwriteTransactionType,`)
    .writeLine(`silent?: boolean,`)
    .writeLine(`addToOutbox?: boolean`)
    .writeLine(`}`)
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "upsert">>`)
    .block(() => {
      writer
        .writeLine(`const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};`)
        .writeLine(`let tx = txOption;`);
      addGetAndUpsertRecord(writer, model);
      addRefetchAndReturnRecord(writer, model);
    });
}

function addGetAndUpsertRecord(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(
      `const neededStores = this._getNeededStoresForUpdate({ ...query, data: { ...query.update, ...query.create } as Prisma.Args<Prisma.${model.name}Delegate, "update">["data"] });`,
    )
    .writeLine(`tx = tx ?? this.client._db.transaction(Array.from(neededStores), "readwrite");`)
    .writeLine(`let record = await this.findUnique({ where: query.where }, { tx });`)
    .writeLine(`if (!record) record = await this.create({ data: query.create }, { tx, silent, addToOutbox });`)
    .writeLine(
      `else record = await this.update({ where: query.where, data: query.update }, { tx, silent, addToOutbox });`,
    );
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
  recordFindQuery += " }, { tx });";

  writer
    .writeLine(recordFindQuery)
    .writeLine(`return record as Prisma.Result<Prisma.${model.name}Delegate, Q, "upsert">;`);
}
