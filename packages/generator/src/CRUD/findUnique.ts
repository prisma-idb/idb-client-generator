import { ClassDeclaration, CodeBlockWriter } from "ts-morph";

// TODO: select, include, and where clauses (also nested versions)

export function addFindUniqueMethod(modelClass: ClassDeclaration) {
  modelClass.addMethod({
    name: "findUnique",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<T, "findUnique">` }],
    parameters: [{ name: "query", type: "Q" }],
    returnType: `Promise<Prisma.Result<T, Q, "findUnique"> | null>`,
    statements: (writer) => writeFindUniqueFunction(writer),
  });
}

function writeFindUniqueFunction(writer: CodeBlockWriter) {
  writer.writeLine("const queryWhere = query.where as Record<string, unknown>;");

  writePrimaryKeyCheck(writer);
  writeIdentifierFieldCheck(writer);
  writeNonKeyUniqueFieldsLoop(writer);

  writer.writeLine("throw new Error('No unique field provided for findUnique');");
}

function writePrimaryKeyCheck(writer: CodeBlockWriter) {
  writer.writeLine("if (this.model.primaryKey)").block(() => {
    writer.writeLine("const pk = this.model.primaryKey;");
    writer.writeLine("const keyFieldName = pk.fields.join('_');");

    writer
      .writeLine("return (")
      .write("filterByWhereClause(")
      .writeLine(
        "[await this.client.db.get(toCamelCase(this.model.name), Object.values(queryWhere[keyFieldName]!) ?? null)],",
      )
      .writeLine("this.keyPath,")
      .writeLine("query.where,")
      .write(")[0] as Prisma.Args<T, 'findUnique'>) ?? null;");
  });
}

function writeIdentifierFieldCheck(writer: CodeBlockWriter) {
  writer.writeLine("else").block(() => {
    writer.writeLine("const identifierFieldName = JSON.parse(generateIDBKey(this.model))[0];");

    writer.writeLine("if (queryWhere[identifierFieldName])").block(() => {
      writer
        .write("return (await this.client.db.get(")
        .write("toCamelCase(this.model.name), [queryWhere[identifierFieldName]] as IDBValidKey")
        .write(")) ?? null;")
        .newLine();
    });
  });
}

function writeNonKeyUniqueFieldsLoop(writer: CodeBlockWriter) {
  writer
    .writeLine("getModelFieldData(this.model)")
    .write(".nonKeyUniqueFields.map(({ name }) => name)")
    .write(".forEach(async (uniqueField) => {")
    .block(() => {
      writer.writeLine("if (!queryWhere[uniqueField]) return;");
      writer
        .write("return (await this.client.db.getFromIndex(")
        .write("toCamelCase(this.model.name), ")
        .write("`${uniqueField}Index`, ")
        .write("queryWhere[uniqueField] as IDBValidKey")
        .write(")) ?? null;")
        .newLine();
    })
    .writeLine("});");
}
