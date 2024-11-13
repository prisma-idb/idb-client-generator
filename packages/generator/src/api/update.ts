import { ClassDeclaration, CodeBlockWriter } from "ts-morph";

// TODO: indexes, nested select, include, where, list updates, object updates, operational updates (string, int (increment, etc))

export function addUpdateMethod(modelClass: ClassDeclaration) {
  modelClass.addMethod({
    name: "update",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<T, "update">` }],
    parameters: [{ name: "query", type: "Q" }],
    returnType: `Promise<Prisma.Result<T, Q, "update">>`,
    statements: (writer) => {
      writer
        .writeLine("const record = await this.findFirst(query);")
        .writeLine("if (record === null) throw new Error('Record not found');")
        .blankLine()
        .writeLine("this.model.fields.forEach((field) => {")
        .indent(() => {
          writer
            .writeLine("const fieldName = field.name as keyof typeof record & keyof typeof query.data;")
            .writeLine("if (query.data[fieldName] !== undefined) {")
            .indent(() => {
              handleFieldUpdates(writer);
            })
            .writeLine("}");
        })
        .writeLine("});")
        .writeLine("await this.client.db.put(this.model.name, record);")
        .writeLine("this.emit('update');")
        .writeLine("return record as Prisma.Result<T, Q, 'update'>;");
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
    .writeLine("const fieldType = field.type as typeof prismaToJsTypes extends Map<infer K, unknown> ? K : never;")
    .writeLine("const jsType = prismaToJsTypes.get(fieldType);")
    .writeLine("if (!jsType || jsType === 'unknown') throw new Error(`Unsupported type: ${field.type}`);")
    .blankLine()
    .writeLine("if (typeof query.data[fieldName] === jsType) {")
    .indent(() => writer.writeLine("record[fieldName] = query.data[fieldName];"))
    .writeLine("} else {")
    .indent(() => writer.writeLine("throw new Error('Indirect updates not yet supported');"))
    .writeLine("}");
}
