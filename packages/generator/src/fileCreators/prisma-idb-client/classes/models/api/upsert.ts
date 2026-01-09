import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getUniqueIdentifiers } from "../../../../../helpers/utils";
import { getOptionsParameterWrite, getOptionsSetupWrite } from "../helpers/methodOptions";

/**
 * Emits an async `upsert` method implementation for the specified Prisma model into the provided CodeBlockWriter.
 *
 * @param writer - The CodeBlockWriter to write the generated method source into
 * @param model - The Prisma model metadata describing the target for which the `upsert` method is generated
 */
export function addUpsertMethod(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async upsert<Q extends Prisma.Args<Prisma.${model.name}Delegate, "upsert">>(`)
    .writeLine(`query: Q,`)
    .write(getOptionsParameterWrite())
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "upsert">>`)
    .block(() => {
      writer.write(getOptionsSetupWrite());
      addGetAndUpsertRecord(writer, model);
      addRefetchAndReturnRecord(writer, model);
    });
}

/**
 * Emits the transactional fetch-and-mutate core of an upsert: determines required stores, ensures a read-write transaction, attempts to find the existing record, and emits either a create or update call.
 *
 * @param writer - CodeBlockWriter used to write the generated statements into the method body.
 * @param model - Model metadata used to reference the model name and derive Prisma types in the emitted code.
 */
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

/**
 * Emit code that re-fetches the upserted record inside the current transaction and returns it as a typed Prisma upsert result.
 *
 * Writes a `findUniqueOrThrow` call that uses the model's primary key to locate the record, includes `select: query.select`,
 * conditionally adds `include: query.include` when the model has relational fields, executes the fetch with `{ tx }`,
 * and returns the fetched record cast to `Prisma.Result<Prisma.{Model}Delegate, Q, "upsert">`.
 *
 * @param writer - The CodeBlockWriter used to emit the TypeScript code.
 * @param model - The Prisma model metadata used to determine the primary key and whether relations should be included.
 */
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