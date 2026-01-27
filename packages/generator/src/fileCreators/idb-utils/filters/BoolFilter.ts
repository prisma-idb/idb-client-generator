import type { Model } from "src/fileCreators/types";
import type CodeBlockWriter from "code-block-writer";

export function addBoolFilter(writer: CodeBlockWriter, models: readonly Model[]) {
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

  writer
    .writeLine(
      `export function whereBoolFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(record: R, fieldName: keyof R, boolFilter: ${filterType}): boolean`
    )
    .block(() => {
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
      writer.writeLine(`if (boolFilter.equals !== value) return false;`);
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
      writer.writeLine(`if (boolFilter.not === value) return false;`);
    });
}
