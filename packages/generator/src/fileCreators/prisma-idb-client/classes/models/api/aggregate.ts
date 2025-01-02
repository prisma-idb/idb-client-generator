import { ClassDeclaration, CodeBlockWriter } from "ts-morph";
import { Model } from "../../../../../fileCreators/types";

export function addAggregateMethod(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "aggregate",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, 'aggregate'>` }],
    parameters: [
      { name: "query", hasQuestionToken: true, type: "Q" },
      { name: "tx", hasQuestionToken: true, type: "IDBUtils.TransactionType" },
    ],
    returnType: `Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, 'aggregate'>>`,
    statements: (writer) => {
      addTxAndRecordSetup(writer, model);
      addCountHandling(writer);
      addAvgHandling(writer, model);
      addSumHandling(writer, model);
      addMinHandling(writer, model);
      addMaxHandling(writer, model);
      writer.writeLine(`return result as unknown as Prisma.Result<Prisma.${model.name}Delegate, Q, "aggregate">;`);
    },
  });
}

function addTxAndRecordSetup(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`tx = tx ?? this.client._db.transaction(["${model.name}"], "readonly");`)
    .writeLine(`const records = await this.findMany({ where: query?.where }, tx);`)
    .writeLine(`const result: Partial<Prisma.Result<Prisma.${model.name}Delegate, Q, "aggregate">> = {};`);
}

function addCountHandling(writer: CodeBlockWriter) {
  writer.writeLine(`if (query?._count)`).block(() => {
    writer
      .writeLine(`if (query._count === true)`)
      .block(() => {
        writer.writeLine(`(result._count as number) = records.length;`);
      })
      .writeLine(`else`)
      .block(() => {
        writer.writeLine(`for (const key of Object.keys(query._count))`).block(() => {
          writer
            .writeLine(`const typedKey = key as keyof typeof query._count;`)
            .writeLine(`if (typedKey === "_all")`)
            .block(() => {
              writer
                .writeLine(`(result._count as Record<string, number>)[typedKey] = records.length;`)
                .writeLine(`continue;`);
            })
            .writeLine(`(result._count as Record<string, number>)[typedKey] = (`)
            .writeLine("await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, tx)")
            .writeLine(`).length;`);
        });
      });
  });
}

function addAvgHandling(writer: CodeBlockWriter, model: Model) {
  writer.writeLine(`if (query?._avg)`).block(() => {
    writer
      .writeLine(`const avgResult = {} as Prisma.Result<Prisma.${model.name}Delegate, Q, "aggregate">["_avg"];`)
      .writeLine(`for (const untypedField of Object.keys(query._avg))`)
      .block(() => {
        writer
          .writeLine(`const field = untypedField as keyof (typeof records)[number];`)
          .writeLine(`const values = records.map((record) => record[field] as number);`)
          .writeLine(
            `(avgResult[field as keyof typeof avgResult] as number) = values.reduce((a, b) => a + b, 0) / values.length;`,
          );
      })
      .writeLine(`result._avg = avgResult;`);
  });
}

function addSumHandling(writer: CodeBlockWriter, model: Model) {
  writer.writeLine(`if (query?._sum)`).block(() => {
    writer
      .writeLine(`const sumResult = {} as Prisma.Result<Prisma.${model.name}Delegate, Q, "aggregate">["_sum"];`)
      .writeLine(`for (const untypedField of Object.keys(query._sum))`)
      .block(() => {
        writer
          .writeLine(`const field = untypedField as keyof (typeof records)[number];`)
          .writeLine(`const values = records.map((record) => record[field] as number);`)
          .writeLine(`(sumResult[field as keyof typeof sumResult] as number) = values.reduce((a, b) => a + b, 0);`);
      })
      .writeLine(`result._sum = sumResult;`);
  });
}

function addMinHandling(writer: CodeBlockWriter, model: Model) {
  writer.writeLine(`if (query?._min)`).block(() => {
    writer
      .writeLine(`const minResult = {} as Prisma.Result<Prisma.${model.name}Delegate, Q, "aggregate">["_min"];`)
      .writeLine(`for (const untypedField of Object.keys(query._min))`)
      .block(() => {
        writer
          .writeLine(`const field = untypedField as keyof (typeof records)[number];`)
          .writeLine(`const values = records.map((record) => record[field] as number);`)
          .writeLine(`(minResult[field as keyof typeof minResult] as number) = Math.min(...values);`);
      })
      .writeLine(`result._min = minResult;`);
  });
}

function addMaxHandling(writer: CodeBlockWriter, model: Model) {
  writer.writeLine(`if (query?._max)`).block(() => {
    writer
      .writeLine(`const maxResult = {} as Prisma.Result<Prisma.${model.name}Delegate, Q, "aggregate">["_max"];`)
      .writeLine(`for (const untypedField of Object.keys(query._max))`)
      .block(() => {
        writer
          .writeLine(`const field = untypedField as keyof (typeof records)[number];`)
          .writeLine(`const values = records.map((record) => record[field] as number);`)
          .writeLine(`(maxResult[field as keyof typeof maxResult] as number) = Math.max(...values);`);
      })
      .writeLine(`result._max = maxResult;`);
  });
}
