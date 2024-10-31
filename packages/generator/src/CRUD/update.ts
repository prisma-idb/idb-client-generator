import { ClassDeclaration, CodeBlockWriter } from "ts-morph";

// TODO: indexes, nested select, include, where, list updates, object updates, operational updates (string, int (increment, etc))

export function addUpdateMethod(modelClass: ClassDeclaration) {
  modelClass.addMethod({
    name: "update",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<T, "create">` }],
    parameters: [{ name: "query", type: "Q" }],
    returnType: `Promise<Prisma.Result<T, Q, "create">>`,
    statements: (writer) => {
      writer
        .writeLine("const record = (await this.findFirst(query)) as Record<string, unknown>;")
        .writeLine("if (record === null) throw new Error('Record not found');")
        .writeLine("this.model.fields.forEach((field) => {")
        .indent(() => {
          writer
            .writeLine("const fieldName = field.name as keyof Q['data'] & string;")
            .writeLine("const queryData = query.data as Record<string, unknown>;")
            .writeLine("if (queryData[fieldName] !== undefined) {")
            .indent(() => {
              handleFieldUpdates(writer);
            })
            .writeLine("}");
        })
        .writeLine("});")
        .writeLine("await this.client.db.put(toCamelCase(this.model.name), record);")
        .writeLine("this.emit('update');")
        .writeLine("return record as Prisma.Result<T, Q, 'create'>;");
    },
  });
}

function handleFieldUpdates(writer: CodeBlockWriter) {
  writer
    .writeLine("if (field.kind === 'object') {")
    .indent(() => writer.writeLine("throw new Error('Object updates not yet supported');"))
    .writeLine("} else if (field.isList) {")
    .indent(() => writer.writeLine("throw new Error('List updates not yet supported');"))
    .writeLine("} else {")
    .indent(() => {
      handlePrimitiveFieldUpdates(writer);
    })
    .writeLine("}");
}

function handlePrimitiveFieldUpdates(writer: CodeBlockWriter) {
  writer
    .writeLine("const jsType = prismaToJsTypes.get(field.type);")
    .writeLine("if (!jsType) throw new Error(`Unsupported type: ${field.type}`);")
    .writeLine("if (typeof queryData[fieldName] === jsType) {")
    .indent(() => writer.writeLine("record[fieldName] = queryData[fieldName];"))
    .writeLine("} else {")
    .indent(() => writer.writeLine("throw new Error('Indirect updates not yet supported');"))
    .writeLine("}");
}
