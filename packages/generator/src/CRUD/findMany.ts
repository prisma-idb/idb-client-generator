import { Model } from "src/types";
import { toCamelCase } from "src/utils";
import { ClassDeclaration } from "ts-morph";

// TODO: orderBy, indexes, nested select, include, where

export function addFindManyMethod(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "findMany",
    isAsync: true,
    typeParameters: [{ name: "T", constraint: `Prisma.${model.name}FindManyArgs` }],
    parameters: [{ name: "query?", type: "T" }],
    returnType: `Promise<Prisma.${model.name}GetPayload<T>[]>`,
    statements: (writer) => {
      writer
        .writeLine(`const records = await this.client.db.getAll("${toCamelCase(model.name)}");`)
        .writeLine(`return filterByWhereClause(`)
        .indent(() => {
          writer.writeLine(`records, this.keyPath, query?.where`);
        })
        .writeLine(`) as Prisma.${model.name}GetPayload<T>[];`);
    },
  });
}
