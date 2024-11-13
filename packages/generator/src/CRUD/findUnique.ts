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
  writer.writeLine("if (this.model.primaryKey && this.model.primaryKey.fields.length > 1)").block(() => {
    writer.writeLine(
      'const keyFieldValue = queryWhere[this.model.primaryKey.fields.join("_")] as Record<string, unknown>;',
    );
    writer.writeLine(
      'const tupleKey = this.keyPath.map((key) => keyFieldValue[key]) as PrismaIDBSchema[typeof this.model.name]["key"];',
    );
    writer.writeLine("const foundRecord = await this.client.db.get(this.model.name, tupleKey);");
    writer.writeLine("if (!foundRecord) return null;");

    writer
      .writeLine("return (")
      .write("filterByWhereClause(")
      .writeLine("[foundRecord],")
      .writeLine("this.keyPath,")
      .writeLine("query.where,")
      .write(")[0] as Prisma.Result<T, Q, 'findUnique'>) ?? null;");
  });
}

function writeIdentifierFieldCheck(writer: CodeBlockWriter) {
  writer.writeLine("else").block(() => {
    writer.writeLine("const identifierFieldName = JSON.parse(generateIDBKey(this.model))[0];");

    writer.writeLine("if (queryWhere[identifierFieldName])").block(() => {
      writer
        .write("return ((await this.client.db.get(")
        .write(
          'this.model.name, [queryWhere[identifierFieldName]] as unknown as PrismaIDBSchema[typeof this.model.name]["key"])) ?? null) ',
        )
        .write('as Prisma.Result<T, Q, "findUnique">;')
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
        .write("this.model.name, ")
        .write("`${uniqueField}Index`, ")
        .write("queryWhere[uniqueField] as IDBValidKey")
        .write(")) ?? null;")
        .newLine();
    })
    .writeLine("});");
}
