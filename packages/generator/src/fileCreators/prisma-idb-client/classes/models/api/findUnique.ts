import { ClassDeclaration, CodeBlockWriter } from "ts-morph";
import { Model } from "../../../../../fileCreators/types";
import { getUniqueIdentifiers } from "../../../../../helpers/utils";

export function addFindUniqueMethod(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "findUnique",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, 'findUnique'>` }],
    parameters: [{ name: "query", type: "Q" }],
    returnType: `Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, 'findUnique'>>`,
    statements: (writer) => {
      writer.writeLine("let record;");
      getFromKeyIdentifier(writer, model);
      getFromNonKeyIdentifier(writer, model);
      writer
        .writeLine("if (!record) return null;")
        .blankLine()
        .write(`const recordWithRelations = `)
        .write(`this.applySelectClause(await this.applyRelations([record], query), query.select)[0];`)
        .writeLine(`return recordWithRelations as Prisma.Result<Prisma.${model.name}Delegate, Q, "findUnique">;`);
    },
  });
}

function getFromKeyIdentifier(writer: CodeBlockWriter, model: Model) {
  const keyUniqueIdentifier = getUniqueIdentifiers(model)[0];
  const fieldNames = JSON.parse(keyUniqueIdentifier.keyPath) as string[];

  let fields: string;
  if (fieldNames.length === 1) {
    fields = JSON.stringify(fieldNames.map((fieldName: string) => `query.where.${fieldName}`));
  } else {
    fields = JSON.stringify(
      fieldNames.map((fieldName: string) => `query.where.${keyUniqueIdentifier.name}.${fieldName}`),
    );
  }
  fields = fields.replaceAll('"', "");

  writer.writeLine(`if (query.where.${keyUniqueIdentifier.name})`).block(() => {
    writer.write(`record = await this.client.db.get('${model.name}', ${fields})`);
  });
}

function getFromNonKeyIdentifier(writer: CodeBlockWriter, model: Model) {
  const nonKeyUniqueIdentifiers = getUniqueIdentifiers(model).slice(1);

  nonKeyUniqueIdentifiers.forEach(({ name, keyPath }) => {
    const fieldNames = JSON.parse(keyPath) as string[];

    let fields: string;
    if (fieldNames.length === 1) {
      fields = JSON.stringify(fieldNames.map((fieldName: string) => `query.where.${fieldName}`));
    } else {
      fields = JSON.stringify(fieldNames.map((fieldName: string) => `query.where.${name}.${fieldName}`));
    }
    fields = fields.replaceAll('"', "");

    writer.writeLine(`else if (query.where.${name})`).block(() => {
      writer.write(`record = await this.client.db.getFromIndex`).write(`('${model.name}', '${name}Index', ${fields})`);
    });
  });
}
