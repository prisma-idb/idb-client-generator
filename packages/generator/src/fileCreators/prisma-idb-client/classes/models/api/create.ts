import { ClassDeclaration, CodeBlockWriter } from "ts-morph";
import { Model } from "../../../../../fileCreators/types";

// TODO: referential integrity?
// TODO: nested creates, connect, connectOrCreate

export function addCreateMethod(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "create",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, "create">` }],
    parameters: [{ name: "query", type: "Q" }],
    returnType: `Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "create">>`,
    statements: (writer) => {
      fillDefaults(writer, model);
      addTransactionalHandling(writer, model);
      applyClausesAndReturnRecords(writer, model);
    },
  });
}

function fillDefaults(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine("const record = await this._fillDefaults(query.data);")
    .writeLine(`let keyPath: PrismaIDBSchema['${model.name}']['key']`);
}

function applyClausesAndReturnRecords(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`const data = (await this.client._db.get("${model.name}", keyPath))!;`)
    .write(`const recordsWithRelations = this._applySelectClause`)
    .write(`(await this._applyRelations([data], query), query.select)[0];`);

  writer.writeLine(`return recordsWithRelations as Prisma.Result<Prisma.${model.name}Delegate, Q, "create">;`);
}

function addTransactionalHandling(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`const storesNeeded = this._getNeededStoresForCreate(query.data);`)
    .writeLine(`if (storesNeeded.size === 0)`)
    .block(() => {
      writer.writeLine(`keyPath = await this.client._db.add("${model.name}", record);`);
    })
    .writeLine(`else`)
    .block(() => {
      writer
        .writeLine(`const tx = this.client._db.transaction(`)
        .writeLine(`["${model.name}", ...Array.from(storesNeeded)],`)
        .writeLine(`"readwrite"`)
        .writeLine(`);`)
        .writeLine(`await this._performNestedCreates(query.data, tx);`)
        .writeLine(`keyPath = await tx.objectStore("${model.name}").add(this._removeNestedCreateData(record));`)
        .writeLine(`tx.commit();`);
    });
}
