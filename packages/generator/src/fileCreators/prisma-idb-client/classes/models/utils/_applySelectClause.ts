import { Model } from "src/fileCreators/types";
import CodeBlockWriter from "code-block-writer";

export function addApplySelectClause(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`private _applySelectClause<S extends Prisma.Args<Prisma.${model.name}Delegate, 'findMany'>['select']>(`)
    .writeLine(`records: Prisma.Result<Prisma.${model.name}Delegate, object, 'findFirstOrThrow'>[],`)
    .writeLine(`selectClause: S,`)
    .writeLine(`): Prisma.Result<Prisma.${model.name}Delegate, { select: S }, 'findFirstOrThrow'>[]`)
    .block(() => {
      addEarlyExit(writer, model);
      addSelectProcessing(writer, model);
    });
}

function addEarlyExit(writer: CodeBlockWriter, model: Model) {
  writer.writeLine("if (!selectClause)").block(() => {
    writer.writeLine(
      `return records as Prisma.Result<Prisma.${model.name}Delegate, { select: S }, 'findFirstOrThrow'>[];`,
    );
  });
}

function addSelectProcessing(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine("return records.map((record) => ")
    .block(() => {
      writer
        .writeLine("const partialRecord: Partial<typeof record> = record;")
        .writeLine(`for (const untypedKey of ${JSON.stringify(model.fields.map(({ name }) => name))}) `)
        .block(() => {
          writer
            .writeLine("const key = untypedKey as keyof typeof record & keyof S;")
            .writeLine("if (!selectClause[key]) delete partialRecord[key];");
        })
        .writeLine("return partialRecord;");
    })
    .writeLine(`) as Prisma.Result<Prisma.${model.name}Delegate, { select: S }, 'findFirstOrThrow'>[];`);
}
