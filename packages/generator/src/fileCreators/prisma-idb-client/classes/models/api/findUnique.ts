import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getUniqueIdentifiers } from "../../../../../helpers/utils";
import { getOptionsParameterRead } from "../helpers/methodOptions";

export function addFindUniqueMethod(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async findUnique<Q extends Prisma.Args<Prisma.${model.name}Delegate, "findUnique">>(`)
    .writeLine(`query: Q,`)
    .write(getOptionsParameterRead())
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "findUnique">>`)
    .block(() => {
      writer
        .writeLine(`const { tx: txOption } = options ?? {};`)
        .writeLine(`let tx = txOption;`)
        .writeLine(
          `tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");`,
        )
        .writeLine("let record;");
      getFromKeyIdentifier(writer, model);
      getFromNonKeyIdentifier(writer, model);
      writer
        .writeLine("if (!record) return null;")
        .blankLine()
        .write(`const recordWithRelations = `)
        .write(
          `this._applySelectClause(await this._applyRelations(await this._applyWhereClause([record], query.where, tx), tx, query), query.select)[0];`,
        )
        .writeLine(`this._preprocessListFields([recordWithRelations]);`)
        .writeLine(`return recordWithRelations as Prisma.Result<Prisma.${model.name}Delegate, Q, "findUnique">;`);
    });
}

function getFromKeyIdentifier(writer: CodeBlockWriter, model: Model) {
  const keyUniqueIdentifier = getUniqueIdentifiers(model)[0];
  const fieldNames = JSON.parse(keyUniqueIdentifier.keyPath) as string[];

  let fields: string;
  if (fieldNames.length === 1) {
    fields = JSON.stringify(fieldNames.map((fieldName: string) => `query.where.${fieldName}`));
  } else {
    fields = JSON.stringify(
      fieldNames.map((fieldName: string) => `query.where.${keyUniqueIdentifier.name}.${fieldName}`),
    );
  }
  fields = fields.replaceAll('"', "");

  writer.writeLine(`if (query.where.${keyUniqueIdentifier.name} !== undefined)`).block(() => {
    writer.writeLine(`record = await tx.objectStore("${model.name}").get(${fields});`);
  });
}

function getFromNonKeyIdentifier(writer: CodeBlockWriter, model: Model) {
  const nonKeyUniqueIdentifiers = getUniqueIdentifiers(model).slice(1);

  nonKeyUniqueIdentifiers.forEach(({ name, keyPath }) => {
    const fieldNames = JSON.parse(keyPath) as string[];

    let fields: string;
    if (fieldNames.length === 1) {
      fields = JSON.stringify(fieldNames.map((fieldName: string) => `query.where.${fieldName}`));
    } else {
      fields = JSON.stringify(fieldNames.map((fieldName: string) => `query.where.${name}.${fieldName}`));
    }
    fields = fields.replaceAll('"', "");

    writer.writeLine(`else if (query.where.${name} !== undefined)`).block(() => {
      writer.writeLine(`record = await tx.objectStore("${model.name}").index("${name}Index").get(${fields});`);
    });
  });
}
