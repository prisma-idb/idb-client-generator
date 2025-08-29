import { CodeBlockWriter } from "ts-morph";
import { Model } from "../../../../../fileCreators/types";

export function addCountMethod(writer: CodeBlockWriter, model: Model, autoDeletedAtFilter: boolean) {
  writer
    .writeLine(`async count<Q extends Prisma.Args<Prisma.${model.name}Delegate, "count">>(`)
    .writeLine(`query?: Q,`)
    .writeLine(`options?: `)
    .block(() => {
      writer
        .writeLine(`tx?: IDBUtils.TransactionType,`)
        .conditionalWriteLine(autoDeletedAtFilter, `skipAutoDeletedAtFilter?: boolean`);
    })
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "count">>`)
    .block(() => {
      writer.writeLine(`const tx = options?.tx ?? this.client._db.transaction(["${model.name}"], "readonly");`);
      handleWithoutSelect(writer, model);
      handleWithSelect(writer, model);
    });
}

function handleWithoutSelect(writer: CodeBlockWriter, model: Model) {
  writer.writeLine(`if (!query?.select || query.select === true)`).block(() => {
    writer
      .writeLine(`const records = await this.findMany({ where: query?.where }, { tx });`)
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
            .writeLine(`result[typedKey] = (await this.findMany({ where: query.where }, { tx })).length;`)
            .writeLine(`continue;`);
        })
        .writeLine(
          "result[typedKey] = (await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })).length;",
        );
    })
    .writeLine(`return result as Prisma.Result<Prisma.${model.name}Delegate, Q, "count">;`);
}
