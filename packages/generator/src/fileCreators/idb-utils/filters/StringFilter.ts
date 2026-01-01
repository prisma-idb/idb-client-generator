import { Model } from "src/fileCreators/types";
import type CodeBlockWriter from "code-block-writer";

export function addStringFilter(writer: CodeBlockWriter, models: readonly Model[]) {
  const stringFields = models.flatMap(({ fields }) => fields).filter((field) => field.type === "String");
  if (stringFields.length === 0) return;

  const nonNullableStringFieldPresent = stringFields.some(({ isRequired }) => isRequired);
  const nullableStringFieldPresent = stringFields.some(({ isRequired }) => !isRequired);

  let filterType = "undefined | string";
  if (nonNullableStringFieldPresent) {
    filterType += " | Prisma.StringFilter<unknown>";
  }
  if (nullableStringFieldPresent) {
    filterType += " | null | Prisma.StringNullableFilter<unknown>";
  }

  writer
    .writeLine(
      `export function whereStringFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(record: R, fieldName: keyof R, stringFilter: ${filterType}): boolean`,
    )
    .block(() => {
      writer
        .writeLine(`if (stringFilter === undefined) return true;`)
        .blankLine()
        .writeLine(`const value = record[fieldName] as string | null;`)
        .writeLine(`if (stringFilter === null) return value === null;`)
        .blankLine()
        .writeLine(`if (typeof stringFilter === 'string')`)
        .block(() => {
          writer.writeLine(`if (value !== stringFilter) return false;`);
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
          addContainsHandler(writer);
          addStartsWithHandler(writer);
          addEndsWithHandler(writer);
        })
        .writeLine(`return true;`);
    });
}

function addEqualsHandler(writer: CodeBlockWriter) {
  writer
    .writeLine(`if (stringFilter.equals === null)`)
    .block(() => {
      writer.writeLine(`if (value !== null) return false;`);
    })
    .writeLine(`if (typeof stringFilter.equals === "string")`)
    .block(() => {
      writer
        .writeLine(`if (value === null) return false;`)
        .writeLine(`if (stringFilter.mode === 'insensitive')`)
        .block(() => {
          writer.writeLine(`if (stringFilter.equals.toLowerCase() !== value.toLowerCase()) return false;`);
        })
        .writeLine(`else`)
        .block(() => {
          writer.writeLine(`if (stringFilter.equals !== value) return false;`);
        });
    });
}

function addNotHandler(writer: CodeBlockWriter) {
  writer
    .writeLine(`if (stringFilter.not === null)`)
    .block(() => {
      writer.writeLine(`if (value === null) return false;`);
    })
    .writeLine(`if (typeof stringFilter.not === "string")`)
    .block(() => {
      writer
        .writeLine(`if (value === null) return false;`)
        .writeLine(`if (stringFilter.mode === 'insensitive')`)
        .block(() => {
          writer.writeLine(`if (stringFilter.not.toLowerCase() === value.toLowerCase()) return false;`);
        })
        .writeLine(`else`)
        .block(() => {
          writer.writeLine(`if (stringFilter.not === value) return false;`);
        });
    });
}

function addInHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(stringFilter.in))`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(`if (stringFilter.mode === 'insensitive')`)
      .block(() => {
        writer.writeLine(
          `if (!stringFilter.in.map((s) => s.toLowerCase()).includes(value.toLowerCase())) return false;`,
        );
      })
      .writeLine(`else`)
      .block(() => {
        writer.writeLine(`if (!stringFilter.in.includes(value)) return false;`);
      });
  });
}

function addNotInHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(stringFilter.notIn))`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(`if (stringFilter.mode === 'insensitive')`)
      .block(() => {
        writer.writeLine(
          `if (stringFilter.notIn.map((s) => s.toLowerCase()).includes(value.toLowerCase())) return false;`,
        );
      })
      .writeLine(`else`)
      .block(() => {
        writer.writeLine(`if (stringFilter.notIn.includes(value)) return false;`);
      });
  });
}

function addLtHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof stringFilter.lt === "string")`).block(() => {
    writer.writeLine(`if (value === null) return false;`);
    writer.writeLine(`if (!(value < stringFilter.lt)) return false;`);
  });
}

function addLteHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof stringFilter.lte === "string")`).block(() => {
    writer.writeLine(`if (value === null) return false;`);
    writer.writeLine(`if (!(value <= stringFilter.lte)) return false;`);
  });
}

function addGtHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof stringFilter.gt === "string")`).block(() => {
    writer.writeLine(`if (value === null) return false;`);
    writer.writeLine(`if (!(value > stringFilter.gt)) return false;`);
  });
}

function addGteHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof stringFilter.gte === "string")`).block(() => {
    writer.writeLine(`if (value === null) return false;`);
    writer.writeLine(`if (!(value >= stringFilter.gte)) return false;`);
  });
}

function addContainsHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof stringFilter.contains === "string")`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(`if (stringFilter.mode === 'insensitive')`)
      .block(() => {
        writer.writeLine(`if (!value.toLowerCase().includes(stringFilter.contains.toLowerCase())) return false;`);
      })
      .writeLine(`else`)
      .block(() => {
        writer.writeLine(`if (!value.includes(stringFilter.contains)) return false;`);
      });
  });
}

function addStartsWithHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof stringFilter.startsWith === "string")`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(`if (stringFilter.mode === 'insensitive')`)
      .block(() => {
        writer.writeLine(`if (!value.toLowerCase().startsWith(stringFilter.startsWith.toLowerCase())) return false;`);
      })
      .writeLine(`else`)
      .block(() => {
        writer.writeLine(`if (!value.startsWith(stringFilter.startsWith)) return false;`);
      });
  });
}

function addEndsWithHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof stringFilter.endsWith === "string")`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(`if (stringFilter.mode === 'insensitive')`)
      .block(() => {
        writer.writeLine(`if (!value.toLowerCase().endsWith(stringFilter.endsWith.toLowerCase())) return false;`);
      })
      .writeLine(`else`)
      .block(() => {
        writer.writeLine(`if (!value.endsWith(stringFilter.endsWith)) return false;`);
      });
  });
}
