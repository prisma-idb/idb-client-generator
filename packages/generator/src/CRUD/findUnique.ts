import { Model } from "src/types";
import { generateIDBKey, getModelFieldData, toCamelCase } from "../utils";
import { ClassDeclaration, CodeBlockWriter } from "ts-morph";

// TODO: select, include, and where clauses (also nested versions)

export function addFindUniqueMethod(modelClass: ClassDeclaration, model: Model) {
  const findUniqueMethod = modelClass.addMethod({
    name: "findUnique",
    isAsync: true,
    typeParameters: [{ name: "T", constraint: `Prisma.${model.name}FindUniqueArgs` }],
    parameters: [{ name: "query", type: "T" }],
    returnType: `Promise<Prisma.${model.name}GetPayload<T> | null>`,
  });

  findUniqueMethod.addStatements((writer) => addKeyResolver(writer, model));
  findUniqueMethod.addStatements((writer) => addUniqueFieldResolvers(writer, model));

  findUniqueMethod.addStatements((writer) =>
    writer.writeLine(`throw new Error("No unique field provided in the where clause");`),
  );
}

function addKeyResolver(writer: CodeBlockWriter, model: Model) {
  if (model.primaryKey) {
    const pk = model.primaryKey;
    writer
      .writeLine(`const keyFieldName = "${pk.fields.join("_")}"`)
      .write(`return (await this.client.db.get("${toCamelCase(model.name)}",`)
      .write(`Object.values(query.where[keyFieldName]!))) ?? null;`)
      .newLine();
  } else {
    const identifierFieldName = JSON.parse(generateIDBKey(model))[0];
    writer
      .writeLine(`if (query.where.${identifierFieldName}) {`)
      .indent(() => {
        writer
          .write(`return (await this.client.db.get("${toCamelCase(model.name)}",`)
          .write(` [query.where.${identifierFieldName}])) ?? null;`)
          .newLine();
      })
      .writeLine("}");
  }
}

function addUniqueFieldResolvers(writer: CodeBlockWriter, model: Model) {
  const uniqueFieldNames = getModelFieldData(model).nonKeyUniqueFields.map(({ name }) => name);

  uniqueFieldNames.forEach((uniqueField) => {
    writer
      .writeLine(`if (query.where.${uniqueField}) {`)
      .indent(() => {
        writer
          .write(`return (await this.client.db.getFromIndex("${toCamelCase(model.name)}",`)
          .write(`"${uniqueField}Index", query.where.${uniqueField})) ?? null;`)
          .newLine();
      })
      .writeLine("}");
  });
}
