import { ClassDeclaration, CodeBlockWriter, Scope } from "ts-morph";

function addUuidDefault(writer: CodeBlockWriter) {
  writer.write("data[fieldName] = crypto.randomUUID() as (typeof data)[typeof fieldName];");
}

function addCuidDefault(writer: CodeBlockWriter) {
  writer
    .write("const { createId } = await import('@paralleldrive/cuid2');")
    .write("data[fieldName] = createId() as (typeof data)[typeof fieldName];");
}

function addAutoincrementDefault(writer: CodeBlockWriter) {
  writer
    .write("const transaction = this.client.db.transaction(this.model.name, 'readonly');")
    .write("const store = transaction.objectStore(this.model.name);")
    .write("const cursor = await store.openCursor(null, 'prev');")
    .write("data[fieldName] = (cursor ? Number(cursor.key) + 1 : 1) as (typeof data)[typeof fieldName];");
}

function addDefaultValue(writer: CodeBlockWriter) {
  writer.write("data[fieldName] = defaultValue as (typeof data)[typeof fieldName];");
}

function convertStringDatesToDates(writer: CodeBlockWriter) {
  writer
    .writeLine('this.model.fields.filter((field) => field.type === "DateTime")')
    .writeLine(".forEach((field) => ")
    .block(() => {
      writer
        .writeLine("const fieldName = field.name as keyof D;")
        .writeLine('if (typeof data[fieldName] === "string")')
        .block(() => {
          writer.writeLine("data[fieldName] = new Date(data[fieldName]) as D[keyof D];");
        });
    })
    .writeLine(")");
}

export function addFillDefaultsFunction(modelClass: ClassDeclaration) {
  modelClass.addMethod({
    name: "fillDefaults",
    isAsync: true,
    scope: Scope.Private,
    typeParameters: [
      { name: "Q", constraint: 'Prisma.Args<T, "findFirstOrThrow">' },
      { name: "D", default: 'Prisma.Args<T, "create">["data"]' },
    ],
    parameters: [{ name: "data", type: "D" }],
    returnType: "Promise<Prisma.Result<T, Q, 'findFirstOrThrow'>>",
    statements: (writer) => {
      writer
        .writeLine("if (data === undefined) data = {} as D;")
        .writeLine("await Promise.all(")
        .indent(() => {
          writer.write("this.model.fields").indent(() =>
            writer
              .write(".filter(({ hasDefaultValue }) => hasDefaultValue)")
              .write(".map(async (field) => {")
              .indent(() =>
                writer
                  .write("const fieldName = field.name as keyof D;")
                  .write("const defaultValue = field.default!;")
                  .write("if (data[fieldName] === undefined) {")
                  .indent(() =>
                    writer
                      .write("if (typeof defaultValue === 'object' && 'name' in defaultValue) {")
                      .indent(() =>
                        writer
                          .write("if (defaultValue.name === 'uuid(4)') {")
                          .indent(() => addUuidDefault(writer))
                          .write("} else if (defaultValue.name === 'cuid') {")
                          .indent(() => addCuidDefault(writer))
                          .write("} else if (defaultValue.name === 'autoincrement') {")
                          .indent(() => addAutoincrementDefault(writer))
                          .write("}"),
                      )
                      .write("} else {")
                      .indent(() => addDefaultValue(writer))
                      .write("}"),
                  )
                  .write("}"),
              )
              .write("})"),
          );
        })
        .writeLine(")");
      convertStringDatesToDates(writer);
      writer.writeLine("return data as unknown as Prisma.Result<T, Q, 'findFirstOrThrow'>;");
    },
  });
}
