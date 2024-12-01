import { Model } from "src/fileCreators/types";
import { ClassDeclaration, CodeBlockWriter, Scope } from "ts-morph";

export function addApplySelectClause(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "_applySelectClause",
    scope: Scope.Private,
    typeParameters: [{ name: "S", constraint: `Prisma.Args<Prisma.${model.name}Delegate, 'findMany'>['select']` }],
    parameters: [
      { name: "records", type: `Prisma.Result<Prisma.${model.name}Delegate, object, 'findFirstOrThrow'>[]` },
      { name: "selectClause", type: "S" },
    ],
    returnType: `Prisma.Result<Prisma.${model.name}Delegate, { select: S }, 'findFirstOrThrow'>[]`,
    statements: (writer) => {
      addEarlyExit(writer, model);
      addSelectProcessing(writer, model);
    },
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
