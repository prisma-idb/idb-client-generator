import type { Model } from "src/fileCreators/types";
import type { CodeBlockWriter, SourceFile } from "ts-morph";

export function addBoolFilter(utilsFile: SourceFile, models: readonly Model[]) {
  const booleanFields = models.flatMap(({ fields }) => fields).filter((field) => field.type === "Boolean");
  if (booleanFields.length === 0) return;

  const nonNullableBooleanFieldPresent = booleanFields.some(({ isRequired }) => isRequired);
  const nullableBooleanFieldPresent = booleanFields.some(({ isRequired }) => !isRequired);

  let filterType = "undefined | boolean";
  if (nonNullableBooleanFieldPresent) {
    filterType += " | Prisma.BoolFilter<unknown>";
  }
  if (nullableBooleanFieldPresent) {
    filterType += " | null | Prisma.BoolNullableFilter<unknown>";
  }

  utilsFile.addFunction({
    name: "whereBoolFilter",
    isExported: true,
    typeParameters: [{ name: "T" }, { name: "R", constraint: `Prisma.Result<T, object, "findFirstOrThrow">` }],
    parameters: [
      { name: "record", type: `R` },
      { name: "fieldName", type: "keyof R" },
      {
        name: "boolFilter",
        type: filterType,
      },
    ],
    returnType: "boolean",
    statements: (writer) => {
      writer
        .writeLine(`if (boolFilter === undefined) return true;`)
        .blankLine()
        .writeLine(`const value = record[fieldName] as boolean | null;`)
        .writeLine(`if (boolFilter === null) return value === null;`)
        .blankLine()
        .writeLine(`if (typeof boolFilter === 'boolean')`)
        .block(() => {
          writer.writeLine(`if (value !== boolFilter) return false;`);
        })
        .writeLine(`else`)
        .block(() => {
          addEqualsHandler(writer);
          addNotHandler(writer);
        })
        .writeLine(`return true;`);
    },
  });
}

function addEqualsHandler(writer: CodeBlockWriter) {
  writer
    .writeLine(`if (boolFilter.equals === null)`)
    .block(() => {
      writer.writeLine(`if (value !== null) return false;`);
    })
    .writeLine(`if (typeof boolFilter.equals === "boolean")`)
    .block(() => {
      writer.writeLine(`if (boolFilter.equals != value) return false;`);
    });
}

function addNotHandler(writer: CodeBlockWriter) {
  writer
    .writeLine(`if (boolFilter.not === null)`)
    .block(() => {
      writer.writeLine(`if (value === null) return false;`);
    })
    .writeLine(`if (typeof boolFilter.not === "boolean")`)
    .block(() => {
      writer.writeLine(`if (boolFilter.not == value) return false;`);
    });
}
