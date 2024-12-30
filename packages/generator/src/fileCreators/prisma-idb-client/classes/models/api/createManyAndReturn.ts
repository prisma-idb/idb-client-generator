import { Model } from "../../../../../fileCreators/types";
import { ClassDeclaration } from "ts-morph";

export function addCreateManyAndReturn(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "createManyAndReturn",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, "createManyAndReturn">` }],
    parameters: [
      { name: "query", type: "Q" },
      { name: "tx", type: "IDBUtils.ReadwriteTransactionType", hasQuestionToken: true },
    ],
    returnType: `Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "createManyAndReturn">>`,
    statements: (writer) => {
      writer
        .writeLine(`const createManyData = IDBUtils.convertToArray(query.data);`)
        .writeLine(`const records: Prisma.Result<Prisma.${model.name}Delegate, object, "findMany"> = [];`)
        .writeLine(`tx = tx ?? this.client._db.transaction(["${model.name}"], "readwrite");`)
        .writeLine(`for (const createData of createManyData)`)
        .block(() => {
          writer
            .writeLine(`const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));`)
            .writeLine(`const keyPath = await tx.objectStore("${model.name}").add(record);`)
            .writeLine(`this.emit("create", keyPath);`)
            .writeLine(`records.push(this._applySelectClause([record], query.select)[0]);`);
        })
        .writeLine(`this._preprocessListFields(records);`)
        .writeLine(`return records as Prisma.Result<Prisma.${model.name}Delegate, Q, "createManyAndReturn">;`);
    },
  });
}
