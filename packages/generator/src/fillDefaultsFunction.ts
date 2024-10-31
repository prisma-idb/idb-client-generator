import { ClassDeclaration, CodeBlockWriter } from "ts-morph";

function addUuidDefault(writer: CodeBlockWriter) {
  writer.write("dataField[fieldName] = crypto.randomUUID() as (typeof data)[typeof fieldName];");
}

function addCuidDefault(writer: CodeBlockWriter) {
  writer
    .write("const { createId } = await import('@paralleldrive/cuid2');")
    .write("dataField[fieldName] = createId() as (typeof data)[typeof fieldName];");
}

function addAutoincrementDefault(writer: CodeBlockWriter) {
  writer
    .write("const transaction = this.client.db.transaction(toCamelCase(this.model.name), 'readonly');")
    .write("const store = transaction.objectStore(toCamelCase(this.model.name));")
    .write("const cursor = await store.openCursor(null, 'prev');")
    .write("dataField[fieldName] = (cursor ? Number(cursor.key) + 1 : 1) as (typeof data)[typeof fieldName];");
}

function addDefaultValue(writer: CodeBlockWriter) {
  writer.write("dataField[fieldName] = defaultValue as (typeof data)[typeof fieldName];");
}

export function addFillDefaultsFunction(modelClass: ClassDeclaration) {
  modelClass.addMethod({
    name: "fillDefaults",
    isAsync: true,
    typeParameters: [{ name: "D", constraint: 'Prisma.Args<T, "create">["data"]' }],
    parameters: [{ name: "data", type: "D" }],
    statements: (writer) => {
      writer
        .writeLine("if (data === undefined) data = {} as D;")
        .write("this.model.fields")
        .indent(() =>
          writer
            .write(".filter(({ hasDefaultValue }) => hasDefaultValue)")
            .write(".forEach(async (field) => {")
            .indent(() =>
              writer
                .write("const fieldName = field.name as keyof D & string;")
                .write("const dataField = data as Record<string, unknown>;")
                .write("const defaultValue = field.default!;")
                .write("if (dataField[fieldName] === undefined) {")
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
                .write("}")
                .write("data = dataField as D;"),
            )
            .write("});"),
        )
        .writeLine("return data;");
    },
  });
}
