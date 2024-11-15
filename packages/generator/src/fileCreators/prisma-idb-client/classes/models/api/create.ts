import { ClassDeclaration, CodeBlockWriter } from "ts-morph";
import { Model } from "../../../../../fileCreators/types";

// TODO: referential integrity?
// TODO: nested creates, connect, connectOrCreate

export function addCreateMethod(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "create",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, "create">` }],
    parameters: [
      { name: "query", type: "Q" },
      { name: "tx", hasQuestionToken: true, type: "CreateTransactionType" },
    ],
    returnType: `Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "create">>`,
    statements: (writer) => {
      fillDefaults(writer);
      addTransactionalHandling(writer, model);
      applyClausesAndReturnRecords(writer, model);
    },
  });
}

function fillDefaults(writer: CodeBlockWriter) {
  writer.writeLine("const record = await this.fillDefaults(query.data);");
}

function applyClausesAndReturnRecords(writer: CodeBlockWriter, model: Model) {
  writer
    .write(`const recordsWithRelations = this.applySelectClause`)
    .write(`(await this.applyRelations([record], query), query.select);`);

  writer.writeLine(`return recordsWithRelations as Prisma.Result<Prisma.${model.name}Delegate, Q, "create">;`);
}

function addTransactionalHandling(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`if (!tx)`)
    .block(() => {
      writer
        .writeLine(`const storesNeeded = this._getNeededStoresForCreate(query.data);`)
        .writeLine(`if (storesNeeded.size === 0)`)
        .block(() => {
          writer.writeLine(`await this.client._db.add("${model.name}", record);`);
        })
        .writeLine(`else`)
        .block(() => {
          writer
            .writeLine(`const tx = this.client._db.transaction(`)
            .writeLine(`["${model.name}", ...Array.from(storesNeeded)],`)
            .writeLine(`"readwrite"`)
            .writeLine(`);`)
            .writeLine(`await this.performNestedCreates(query.data, tx);`)
            .writeLine(`await tx.objectStore("${model.name}").add(record);`)
            .writeLine(`tx.commit();`);
        });
    })
    .writeLine(`else`)
    .block(() => {
      writer
        .writeLine(`await this.performNestedCreates(query.data, tx);`)
        .writeLine(`await tx.objectStore("${model.name}").add(record);`);
    });
}
