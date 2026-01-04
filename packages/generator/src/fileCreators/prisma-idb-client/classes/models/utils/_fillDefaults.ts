import { Field, Model } from "src/fileCreators/types";
import CodeBlockWriter from "code-block-writer";

export function addFillDefaultsFunction(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`private async _fillDefaults<`)
    .writeLine(`D extends Prisma.Args<Prisma.${model.name}Delegate, "create">["data"]>(`)
    .writeLine(`data: D,`)
    .writeLine(`tx?: IDBUtils.ReadwriteTransactionType): Promise<D>`)
    .block(() => {
      writer.writeLine("if (data === undefined) data = {} as NonNullable<D>;");
      model.fields
        .filter(({ kind }) => kind !== "object")
        .filter(({ hasDefaultValue, isRequired }) => hasDefaultValue || !isRequired)
        .forEach((field) => {
          writer.writeLine(`if (data.${field.name} === undefined) `).block(() => {
            if (typeof field.default === "object" && "name" in field.default) {
              if (field.default.name === "uuid") {
                addUuidDefault(writer, field);
              } else if (field.default.name === "cuid") {
                addCuidDefault(writer, field);
              } else if (field.default.name === "autoincrement") {
                addAutoincrementDefault(writer, model, field);
              } else if (field.default.name === "now") {
                addNowDefault(writer, field);
              }
            } else if (field.default !== undefined) {
              addDefaultValue(writer, field);
            } else if (!field.isRequired) {
              addNullAssignment(writer, field);
            }
          });
        });
      model.fields.forEach((field) => {
        if (field.type === "DateTime") {
          if (field.isList) {
            addDateStringListToDateConverter(writer, field);
          } else {
            addDateStringToDateConverter(writer, field);
          }
        } else if (field.type === "BigInt") {
          if (field.isList) {
            addBigIntListConverter(writer, field);
          } else {
            addBigIntConverter(writer, field);
          }
        } else if (field.isList && field.kind !== "object") {
          addScalarListProcessing(writer, field);
        }
      });
      writer.writeLine(`return data;`);
    });
}

function addUuidDefault(writer: CodeBlockWriter, field: Field) {
  writer.writeLine(`data.${field.name} = uuidv4();`);
}

function addCuidDefault(writer: CodeBlockWriter, field: Field) {
  writer.writeLine(`data.${field.name} = createId();`);
}

function addAutoincrementDefault(writer: CodeBlockWriter, model: Model, field: Field) {
  writer
    .write(`const transaction = tx ?? this.client._db.transaction(["${model.name}"], "readwrite");`)
    .write(`const store = transaction.objectStore('${model.name}');`)
    .write("const cursor = await store.openCursor(null, 'prev');")
    .write(`data.${field.name} = (cursor ? Number(cursor.key) + 1 : 1);`);
}

function addDefaultValue(writer: CodeBlockWriter, field: Field) {
  if (field.isList) {
    writer.write(`data.${field.name} = ${JSON.stringify(field.default)};`);
  } else if (field.type === "String" || field.kind === "enum") {
    writer.write(`data.${field.name} = '${field.default}';`);
  } else {
    writer.write(`data.${field.name} = ${field.default};`);
  }
}

function addNullAssignment(writer: CodeBlockWriter, field: Field) {
  writer.write(`data.${field.name} = null;`);
}

function addNowDefault(writer: CodeBlockWriter, field: Field) {
  writer.writeLine(`data.${field.name} = new Date();`);
}

function addDateStringToDateConverter(writer: CodeBlockWriter, field: Field) {
  writer.writeLine(`if (typeof data.${field.name} === 'string')`).block(() => {
    writer.writeLine(`data.${field.name} = new Date(data.${field.name})`);
  });
}

function addDateStringListToDateConverter(writer: CodeBlockWriter, field: Field) {
  writer
    .writeLine(`if (Array.isArray(data.${field.name}))`)
    .block(() => {
      writer.writeLine(`data.${field.name} = data.${field.name}.map((d) => new Date(d));`);
    })
    .writeLine(`else if (typeof data.${field.name} === 'object')`)
    .block(() => {
      writer.writeLine(`data.${field.name} = data.${field.name}.set.map((d) => new Date(d));`);
    })
    .writeLine(`else`)
    .block(() => {
      writer.writeLine(`data.${field.name} = []`);
    });
}

function addBigIntConverter(writer: CodeBlockWriter, field: Field) {
  writer.writeLine(`if (typeof data.${field.name} === 'number')`).block(() => {
    writer.writeLine(`data.${field.name} = BigInt(data.${field.name})`);
  });
}

function addBigIntListConverter(writer: CodeBlockWriter, field: Field) {
  writer
    .writeLine(`if (Array.isArray(data.${field.name}))`)
    .block(() => {
      writer.writeLine(`data.${field.name} = data.${field.name}.map((n) => BigInt(n));`);
    })
    .writeLine(`else if (typeof data.${field.name} === 'object')`)
    .block(() => {
      writer.writeLine(`data.${field.name} = data.${field.name}.set.map((n) => BigInt(n));`);
    })
    .writeLine(`else`)
    .block(() => {
      writer.writeLine(`data.${field.name} = []`);
    });
}

function addScalarListProcessing(writer: CodeBlockWriter, field: Field) {
  writer.writeLine(`if (!Array.isArray(data.${field.name}))`).block(() => {
    writer.writeLine(`data.${field.name} = data.${field.name}?.set;`);
  });
}
