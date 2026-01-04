import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";

export function addAggregateMethod(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async aggregate<Q extends Prisma.Args<Prisma.${model.name}Delegate, "aggregate">>(`)
    .writeLine(`query?: Q,`)
    .writeLine(`tx?: IDBUtils.TransactionType,`)
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "aggregate">>`)
    .block(() => {
      addTxAndRecordSetup(writer, model);
      addCountHandling(writer);
      const hasAvgOrSum = model.fields
        .filter(({ isList }) => !isList)
        .some((field) => field.type === "Float" || field.type === "Int" || field.type === "Decimal");
      const hasMinMax =
        hasAvgOrSum ||
        model.fields
          .filter(({ isList }) => !isList)
          .some((field) => field.type === "DateTime" || field.type === "String");
      if (hasMinMax) {
        addMinHandling(writer, model);
        addMaxHandling(writer, model);
      }
      if (hasAvgOrSum) {
        addAvgHandling(writer, model);
        addSumHandling(writer, model);
      }
      writer.writeLine(`return result as unknown as Prisma.Result<Prisma.${model.name}Delegate, Q, "aggregate">;`);
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
  const nonListFields = model.fields.filter(({ isList }) => !isList);

  const numericFields = nonListFields
    .filter(({ isList }) => !isList)
    .filter((field) => field.type === "Float" || field.type === "Int" || field.type === "Decimal")
    .map((field) => field.name);
  const dateTimeFields = nonListFields.filter((field) => field.type === "DateTime").map((field) => field.name);
  const stringFields = nonListFields.filter((field) => field.type === "String").map((field) => field.name);
  const booleanFields = nonListFields.filter((field) => field.type === "Boolean").map((field) => field.name);

  writer.writeLine(`if (query?._min)`).block(() => {
    writer.writeLine(`const minResult = {} as Prisma.Result<Prisma.${model.name}Delegate, Q, "aggregate">["_min"];`);
    if (numericFields.length) {
      writer
        .writeLine(`const numericFields = ${JSON.stringify(numericFields)} as const;`)
        .writeLine(`for (const field of numericFields)`)
        .block(() => {
          writer
            .writeLine(`if (!query._min[field]) continue;`)
            .writeLine(
              `const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);`,
            )
            .writeLine(`(minResult[field as keyof typeof minResult] as number) = Math.min(...values);`);
        });
    }
    if (dateTimeFields.length) {
      writer
        .writeLine(`const dateTimeFields = ${JSON.stringify(dateTimeFields)} as const;`)
        .writeLine(`for (const field of dateTimeFields)`)
        .block(() => {
          writer
            .writeLine(`if (!query._min[field]) continue;`)
            .writeLine(
              `const values = records.map((record) => record[field]?.getTime()).filter((value) => value !== undefined);`,
            )
            .writeLine(`(minResult[field as keyof typeof minResult] as Date) = new Date(Math.min(...values));`);
        });
    }
    if (stringFields.length) {
      writer
        .writeLine(`const stringFields = ${JSON.stringify(stringFields)} as const;`)
        .writeLine(`for (const field of stringFields)`)
        .block(() => {
          writer
            .writeLine(`if (!query._min[field]) continue;`)
            .writeLine(
              `const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);`,
            )
            .writeLine(`(minResult[field as keyof typeof minResult] as string) = values.sort()[0];`);
        });
    }
    if (booleanFields.length) {
      writer
        .writeLine(`const booleanFields = ${JSON.stringify(booleanFields)} as const;`)
        .writeLine(`for (const field of booleanFields)`)
        .block(() => {
          writer
            .writeLine(`if (!query._min[field]) continue;`)
            .writeLine(
              `const values = records.map((record) => record[field] as boolean).filter((value) => value !== undefined);`,
            )
            .writeLine(
              `(minResult[field as keyof typeof minResult] as boolean) = values.length === 0 ? false : values.includes(false) ? false : true;`,
            );
        });
    }
    writer.writeLine(`result._min = minResult;`);
  });
}

function addMaxHandling(writer: CodeBlockWriter, model: Model) {
  const nonListFields = model.fields.filter(({ isList }) => !isList);

  const numericFields = nonListFields
    .filter((field) => field.type === "Float" || field.type === "Int" || field.type === "Decimal")
    .map((field) => field.name);
  const dateTimeFields = nonListFields.filter((field) => field.type === "DateTime").map((field) => field.name);
  const stringFields = nonListFields.filter((field) => field.type === "String").map((field) => field.name);
  const booleanFields = nonListFields.filter((field) => field.type === "Boolean").map((field) => field.name);

  writer.writeLine(`if (query?._max)`).block(() => {
    writer.writeLine(`const maxResult = {} as Prisma.Result<Prisma.${model.name}Delegate, Q, "aggregate">["_max"];`);
    if (numericFields.length) {
      writer
        .writeLine(`const numericFields = ${JSON.stringify(numericFields)} as const;`)
        .writeLine(`for (const field of numericFields)`)
        .block(() => {
          writer
            .writeLine(`if (!query._max[field]) continue;`)
            .writeLine(
              `const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);`,
            )
            .writeLine(`(maxResult[field as keyof typeof maxResult] as number) = Math.max(...values);`);
        });
    }
    if (dateTimeFields.length) {
      writer
        .writeLine(`const dateTimeFields = ${JSON.stringify(dateTimeFields)} as const;`)
        .writeLine(`for (const field of dateTimeFields)`)
        .block(() => {
          writer
            .writeLine(`if (!query._max[field]) continue;`)
            .writeLine(
              `const values = records.map((record) => record[field]?.getTime()).filter((value) => value !== undefined);`,
            )
            .writeLine(`(maxResult[field as keyof typeof maxResult] as Date) = new Date(Math.max(...values));`);
        });
    }
    if (stringFields.length) {
      writer
        .writeLine(`const stringFields = ${JSON.stringify(stringFields)} as const;`)
        .writeLine(`for (const field of stringFields)`)
        .block(() => {
          writer
            .writeLine(`if (!query._max[field]) continue;`)
            .writeLine(
              `const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);`,
            )
            .writeLine(`(maxResult[field as keyof typeof maxResult] as string) = values.sort().reverse()[0];`);
        });
    }
    if (booleanFields.length) {
      writer
        .writeLine(`const booleanFields = ${JSON.stringify(booleanFields)} as const;`)
        .writeLine(`for (const field of booleanFields)`)
        .block(() => {
          writer
            .writeLine(`if (!query._max[field]) continue;`)
            .writeLine(
              `const values = records.map((record) => record[field] as boolean).filter((value) => value !== undefined);`,
            )
            .writeLine(
              `(maxResult[field as keyof typeof maxResult] as boolean) = values.length === 0 ? false : values.includes(true);`,
            );
        });
    }
    writer.writeLine(`result._max = maxResult;`);
  });
}
