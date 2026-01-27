import { Model } from "src/fileCreators/types";
import type CodeBlockWriter from "code-block-writer";

export function addDateTimeListFilter(writer: CodeBlockWriter, models: readonly Model[]) {
  const dateTimeListFields = models
    .flatMap(({ fields }) => fields)
    .filter((field) => field.type === "DateTime" && field.isList);
  if (dateTimeListFields.length === 0) return;

  writer
    .writeLine(
      `export function whereDateTimeListFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(record: R, fieldName: keyof R, scalarListFilter: undefined | Prisma.DateTimeNullableListFilter<unknown>): boolean`
    )
    .block(() => {
      writer
        .writeLine(`if (scalarListFilter === undefined) return true;`)
        .blankLine()
        .writeLine(`const value = record[fieldName] as Date[] | undefined;`)
        .writeLine(`const matches = (d: Date, target: Date | string) => d.getTime() === new Date(target).getTime();`)
        .blankLine()
        .writeLine(`if (value === undefined && Object.keys(scalarListFilter).length) return false;`);
      addEqualsHandler(writer);
      addHasHandler(writer);
      addHasSomeHandler(writer);
      addHasEveryHandler(writer);
      addIsEmptyHandler(writer);
      writer.writeLine(`return true;`);
    });
}

function addEqualsHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(scalarListFilter.equals))`).block(() => {
    writer
      .writeLine(`if (scalarListFilter.equals.length !== value?.length) return false;`)
      .writeLine(
        `if (!scalarListFilter.equals.every((val, i) => new Date(val).getTime() === value[i].getTime())) return false;`
      );
  });
}

function addHasHandler(writer: CodeBlockWriter) {
  writer
    .writeLine(`if (scalarListFilter.has instanceof Date || typeof scalarListFilter.has === 'string')`)
    .block(() => {
      writer.writeLine(`if (!value?.some((v) => matches(v, scalarListFilter.has as Date | string))) return false;`);
    })
    .writeLine(`if (scalarListFilter.has === null) return false;`);
}

function addHasSomeHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(scalarListFilter.hasSome))`).block(() => {
    writer.writeLine(
      `if (!scalarListFilter.hasSome.some((val) => (val instanceof Date || typeof val === 'string') && value?.some((v) => matches(v, val)))) return false;`
    );
  });
}

function addHasEveryHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(scalarListFilter.hasEvery))`).block(() => {
    writer.writeLine(
      `if (!scalarListFilter.hasEvery.every((val) => (val instanceof Date || typeof val === 'string') && value?.some((v) => matches(v, val)))) return false;`
    );
  });
}

function addIsEmptyHandler(writer: CodeBlockWriter) {
  writer
    .writeLine(`if (scalarListFilter.isEmpty === true && value?.length) return false;`)
    .writeLine(`if (scalarListFilter.isEmpty === false && value?.length === 0) return false;`);
}
