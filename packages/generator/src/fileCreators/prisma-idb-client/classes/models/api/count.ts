import { Model } from "../../../../../fileCreators/types";
import { ClassDeclaration, CodeBlockWriter } from "ts-morph";

export function addCountMethod(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "count",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, 'count'>` }],
    parameters: [
      { name: "query", hasQuestionToken: true, type: "Q" },
      { name: "tx", hasQuestionToken: true, type: "IDBUtils.TransactionType" },
    ],
    returnType: `Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, 'count'>>`,
    statements: (writer) => {
      writer.writeLine(`tx = tx ?? this.client._db.transaction(["${model.name}"], "readonly");`);
      handleWithoutSelect(writer, model);
      handleWithSelect(writer, model);
    },
  });
}

function handleWithoutSelect(writer: CodeBlockWriter, model: Model) {
  writer.writeLine(`if (!query?.select || query.select === true)`).block(() => {
    writer
      .writeLine(`const records = await this.findMany({ where: query?.where }, tx);`)
      .writeLine(`return records.length as Prisma.Result<Prisma.${model.name}Delegate, Q, "count">;`);
  });
}

function handleWithSelect(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`const result: Partial<Record<keyof Prisma.${model.name}CountAggregateInputType, number>> = {};`)
    .writeLine(`for (const key of Object.keys(query.select))`)
    .block(() => {
      writer
        .writeLine(`const typedKey = key as keyof typeof query.select;`)
        .writeLine(`if (typedKey === "_all")`)
        .block(() => {
          writer
            .writeLine(`result[typedKey] = (await this.findMany({ where: query.where }, tx)).length;`)
            .writeLine(`continue;`);
        })
        .writeLine(
          "result[typedKey] = (await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, tx)).length;",
        );
    })
    .writeLine(`return result as Prisma.Result<Prisma.${model.name}Delegate, Q, "count">;`);
}
