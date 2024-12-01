import { ClassDeclaration, CodeBlockWriter } from "ts-morph";
import { Model } from "../../../../../fileCreators/types";

// TODO: skipDuplicates

export function addCreateManyMethod(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "createMany",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, "createMany">` }],
    parameters: [
      { name: "query", type: "Q" },
      { name: "tx", hasQuestionToken: true, type: "IDBUtils.ReadwriteTransactionType" },
    ],
    returnType: `Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "createMany">>`,
    statements: (writer) => {
      setupDataAndTx(writer, model);
      addTransactionalHandling(writer, model);
      returnCount(writer);
    },
  });
}

function setupDataAndTx(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine("const createManyData = IDBUtils.convertToArray(query.data);")
    .writeLine(`tx = tx ?? this.client._db.transaction(["${model.name}"], "readwrite");`);
}

function addTransactionalHandling(writer: CodeBlockWriter, model: Model) {
  writer.writeLine(`for (const createData of createManyData)`).block(() => {
    writer
      .writeLine(`const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));`)
      .writeLine(`await tx.objectStore("${model.name}").add(record);`);
  });
}

function returnCount(writer: CodeBlockWriter) {
  writer.writeLine(`return { count: createManyData.length };`);
}
