import type { Model } from "src/fileCreators/types";
import type CodeBlockWriter from "code-block-writer";

export function addNumberFilter(writer: CodeBlockWriter, models: readonly Model[]) {
  const allFields = models.flatMap(({ fields }) => fields);
  const intFields = allFields.filter((field) => field.type === "Int");
  const floatFields = allFields.filter((field) => field.type === "Float");

  if (intFields.length + floatFields.length === 0) return;
  let filterType = "undefined | number";

  if (intFields.some(({ isRequired }) => isRequired)) filterType += "| Prisma.IntFilter<unknown>";
  if (floatFields.some(({ isRequired }) => isRequired)) filterType += "| Prisma.FloatFilter<unknown>";

  if (intFields.some(({ isRequired }) => !isRequired)) filterType += "| Prisma.IntNullableFilter<unknown>";
  if (floatFields.some(({ isRequired }) => !isRequired)) filterType += "| Prisma.FloatNullableFilter<unknown>";
  if (intFields.some(({ isRequired }) => !isRequired) || floatFields.some(({ isRequired }) => !isRequired)) {
    filterType += " | null";
  }

  writer
    .writeLine(
      `export function whereNumberFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(record: R, fieldName: keyof R, numberFilter: ${filterType}): boolean`,
    )
    .block(() => {
      writer
        .writeLine(`if (numberFilter === undefined) return true;`)
        .blankLine()
        .writeLine(`const value = record[fieldName] as number | null;`)
        .writeLine(`if (numberFilter === null) return value === null;`)
        .blankLine()
        .writeLine(`if (typeof numberFilter === 'number')`)
        .block(() => {
          writer.writeLine(`if (value !== numberFilter) return false;`);
        })
        .writeLine(`else`)
        .block(() => {
          addEqualsHandler(writer);
          addNotHandler(writer);
          addInHandler(writer);
          addNotInHandler(writer);
          addLtHandler(writer);
          addLteHandler(writer);
          addGtHandler(writer);
          addGteHandler(writer);
        })
        .writeLine(`return true;`);
    });
}

function addEqualsHandler(writer: CodeBlockWriter) {
  writer
    .writeLine(`if (numberFilter.equals === null)`)
    .block(() => {
      writer.writeLine(`if (value !== null) return false;`);
    })
    .writeLine(`if (typeof numberFilter.equals === "number")`)
    .block(() => {
      writer.writeLine(`if (numberFilter.equals !== value) return false;`);
    });
}

function addNotHandler(writer: CodeBlockWriter) {
  writer
    .writeLine(`if (numberFilter.not === null)`)
    .block(() => {
      writer.writeLine(`if (value === null) return false;`);
    })
    .writeLine(`if (typeof numberFilter.not === "number")`)
    .block(() => {
      writer.writeLine(`if (numberFilter.not === value) return false;`);
    });
}

function addInHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(numberFilter.in))`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(`if (!numberFilter.in.includes(value)) return false;`);
  });
}

function addNotInHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(numberFilter.notIn))`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(`if (numberFilter.notIn.includes(value)) return false;`);
  });
}

function addLtHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof numberFilter.lt === "number")`).block(() => {
    writer.writeLine(`if (value === null) return false;`).writeLine(`if (!(value < numberFilter.lt)) return false;`);
  });
}

function addLteHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof numberFilter.lte === "number")`).block(() => {
    writer.writeLine(`if (value === null) return false;`).writeLine(`if (!(value <= numberFilter.lte)) return false;`);
  });
}

function addGtHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof numberFilter.gt === "number")`).block(() => {
    writer.writeLine(`if (value === null) return false;`).writeLine(`if (!(value > numberFilter.gt)) return false;`);
  });
}

function addGteHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof numberFilter.gte === "number")`).block(() => {
    writer.writeLine(`if (value === null) return false;`).writeLine(`if (!(value >= numberFilter.gte)) return false;`);
  });
}
