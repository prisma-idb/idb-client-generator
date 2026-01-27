import type { Model } from "src/fileCreators/types";
import type CodeBlockWriter from "code-block-writer";

export function addDateTimeFilter(writer: CodeBlockWriter, models: readonly Model[]) {
  const dateTimeFields = models.flatMap(({ fields }) => fields).filter((field) => field.type === "DateTime");
  if (dateTimeFields.length === 0) return;

  const nonNullableDateTimeFieldPresent = dateTimeFields.some(({ isRequired }) => isRequired);
  const nullableDateTimeFieldPresent = dateTimeFields.some(({ isRequired }) => !isRequired);

  let filterType = "undefined | Date | string";
  if (nonNullableDateTimeFieldPresent) {
    filterType += " | Prisma.DateTimeFilter<unknown>";
  }
  if (nullableDateTimeFieldPresent) {
    filterType += " | null | Prisma.DateTimeNullableFilter<unknown>";
  }

  writer
    .writeLine(
      `export function whereDateTimeFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(record: R, fieldName: keyof R, dateTimeFilter: ${filterType}): boolean`
    )
    .block(() => {
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
    .writeLine(`if (typeof dateTimeFilter.not === "string" || dateTimeFilter.not instanceof Date)`)
    .block(() => {
      writer
        .writeLine(`if (value === null) return false;`)
        .writeLine(`if (new Date(dateTimeFilter.not).getTime() === value.getTime()) return false;`);
    });
}

function addInHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(dateTimeFilter.in))`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(
        `if (!dateTimeFilter.in.map((d) => new Date(d)).some((d) => d.getTime() === value.getTime())) return false;`
      );
  });
}

function addNotInHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(dateTimeFilter.notIn))`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(
        `if (dateTimeFilter.notIn.map((d) => new Date(d)).some((d) => d.getTime() === value.getTime())) return false;`
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
