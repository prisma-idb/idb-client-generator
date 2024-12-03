import type { Model } from "src/fileCreators/types";
import type { CodeBlockWriter, SourceFile } from "ts-morph";

export function addDateTimeFilter(utilsFile: SourceFile, models: readonly Model[]) {
  const dateTimeFields = models.flatMap(({ fields }) => fields).filter((field) => field.type === "DateTime");
  if (dateTimeFields.length === 0) return;

  const nullableDateTimeFieldPresent = dateTimeFields.some(({ isRequired }) => !isRequired);
  let filterType = "undefined | Date | string | Prisma.DateTimeFilter<unknown>";
  if (nullableDateTimeFieldPresent) {
    filterType += " | null | Prisma.DateTimeNullableFilter<unknown>";
  }

  utilsFile.addFunction({
    name: "whereDateTimeFilter",
    isExported: true,
    typeParameters: [{ name: "T" }, { name: "R", constraint: `Prisma.Result<T, object, "findFirstOrThrow">` }],
    parameters: [
      { name: "record", type: `R` },
      { name: "fieldName", type: "keyof R" },
      {
        name: "dateTimeFilter",
        type: filterType,
      },
    ],
    returnType: "boolean",
    statements: (writer) => {
      writer
        .writeLine(`if (dateTimeFilter === undefined) return true;`)
        .blankLine()
        .writeLine(`const value = record[fieldName] as Date | null;`)
        .writeLine(`if (dateTimeFilter === null) return value === null;`)
        .blankLine()
        .writeLine(`if (typeof dateTimeFilter === "string" || dateTimeFilter instanceof Date)`)
        .block(() => {
          writer
            .writeLine(`if (value === null) return false;`)
            .writeLine(`if (new Date(dateTimeFilter).getTime() !== value.getTime()) return false;`);
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
    },
  });
}

function addEqualsHandler(writer: CodeBlockWriter) {
  writer
    .writeLine(`if (dateTimeFilter.equals === null)`)
    .block(() => {
      writer.writeLine(`if (value !== null) return false;`);
    })
    .writeLine(`if (typeof dateTimeFilter.equals === "string" || dateTimeFilter.equals instanceof Date)`)
    .block(() => {
      writer
        .writeLine(`if (value === null) return false;`)
        .writeLine(`if (new Date(dateTimeFilter.equals).getTime() !== value.getTime()) return false;`);
    });
}

function addNotHandler(writer: CodeBlockWriter) {
  writer
    .writeLine(`if (dateTimeFilter.not === null)`)
    .block(() => {
      writer.writeLine(`if (value === null) return false;`);
    })
    .writeLine(`if (typeof dateTimeFilter.equals === "string" || dateTimeFilter.equals instanceof Date)`)
    .block(() => {
      writer
        .writeLine(`if (value === null) return false;`)
        .writeLine(`if (new Date(dateTimeFilter.equals).getTime() === value.getTime()) return false;`);
    });
}

function addInHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(dateTimeFilter.in))`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(
        `if (!dateTimeFilter.in.map((d) => new Date(d)).some((d) => d.getTime() === value.getTime())) return false;`,
      );
  });
}

function addNotInHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(dateTimeFilter.notIn))`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(
        `if (dateTimeFilter.notIn.map((d) => new Date(d)).some((d) => d.getTime() === value.getTime())) return false;`,
      );
  });
}

function addLtHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof dateTimeFilter.lt === "string" || dateTimeFilter.lt instanceof Date)`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(`if (!(value.getTime() < new Date(dateTimeFilter.lt).getTime())) return false;`);
  });
}

function addLteHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof dateTimeFilter.lte === "string" || dateTimeFilter.lte instanceof Date)`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(`if (!(value.getTime() <= new Date(dateTimeFilter.lte).getTime())) return false;`);
  });
}

function addGtHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof dateTimeFilter.gt === "string" || dateTimeFilter.gt instanceof Date)`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(`if (!(value.getTime() > new Date(dateTimeFilter.gt).getTime())) return false;`);
  });
}

function addGteHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof dateTimeFilter.gte === "string" || dateTimeFilter.gte instanceof Date)`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(`if (!(value.getTime() >= new Date(dateTimeFilter.gte).getTime())) return false;`);
  });
}
