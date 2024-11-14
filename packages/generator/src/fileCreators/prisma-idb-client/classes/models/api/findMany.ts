import { Model } from "../../../../../fileCreators/types";
import { ClassDeclaration, CodeBlockWriter } from "ts-morph";

export function addFindManyMethod(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "findMany",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, 'findMany'>` }],
    parameters: [{ name: "query", hasQuestionToken: true, type: "Q" }],
    returnType: `Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, 'findMany'>>`,
    statements: (writer) => {
      getRecords(writer, model);
      applyRelationsToRecords(writer, model);
      applySelectClauseToRecords(writer);
      returnRecords(writer, model);
    },
  });
}

function getRecords(writer: CodeBlockWriter, model: Model) {
  writer.writeLine(`const records = await this.client.db.getAll('${model.name}');`);
}

function applyRelationsToRecords(writer: CodeBlockWriter, model: Model) {
  writer
    .write(`const relationAppliedRecords = (await this.applyRelations(records, query)) `)
    .write(`as Prisma.Result<Prisma.${model.name}Delegate, object, 'findFirstOrThrow'>[];`);
}

function applySelectClauseToRecords(writer: CodeBlockWriter) {
  writer
    .writeLine("const selectClause = query?.select;")
    .writeLine("const selectAppliedRecords = this.applySelectClause(relationAppliedRecords, selectClause);");
}

function returnRecords(writer: CodeBlockWriter, model: Model) {
  writer.writeLine(`return selectAppliedRecords as Prisma.Result<Prisma.${model.name}Delegate, Q, 'findMany'>;`);
}