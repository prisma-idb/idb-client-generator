import { Model } from "src/fileCreators/types";
import type CodeBlockWriter from "code-block-writer";

export function addNumberListFilter(writer: CodeBlockWriter, models: readonly Model[]) {
  const allFields = models.flatMap(({ fields }) => fields);
  const numberListFields = allFields.filter(
    (field) => (field.type === "Int" || field.type === "Float") && field.isList,
  );
  if (numberListFields.length === 0) return;

  let listFilterType = "undefined";
  if (allFields.some((field) => field.isList && field.type === "Int")) {
    listFilterType += " | Prisma.IntNullableListFilter<unknown>";
  }
  if (allFields.some((field) => field.isList && field.type === "Float")) {
    listFilterType += " | Prisma.FloatNullableListFilter<unknown>";
  }

  writer.writeLine(`export function whereNumberListFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(record: R, fieldName: keyof R, scalarListFilter: ${listFilterType}): boolean`).block(() => {
    writer
      .writeLine(`if (scalarListFilter === undefined) return true;`)
      .blankLine()
      .writeLine(`const value = record[fieldName] as number[] | undefined;`)
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
      .writeLine(`if (!scalarListFilter.equals.every((val, i) => val === value[i])) return false;`);
  });
}

function addHasHandler(writer: CodeBlockWriter) {
  writer
    .writeLine(`if (typeof scalarListFilter.has === 'number')`)
    .block(() => {
      writer.writeLine(`if (!value?.includes(scalarListFilter.has)) return false;`);
    })
    .writeLine(`if (scalarListFilter.has === null) return false;`);
}

function addHasSomeHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(scalarListFilter.hasSome))`).block(() => {
    writer.writeLine(`if (!scalarListFilter.hasSome.some((val) => value?.includes(val))) return false;`);
  });
}

function addHasEveryHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(scalarListFilter.hasEvery))`).block(() => {
    writer.writeLine(`if (!scalarListFilter.hasEvery.every((val) => value?.includes(val))) return false;`);
  });
}

function addIsEmptyHandler(writer: CodeBlockWriter) {
  writer
    .writeLine(`if (scalarListFilter.isEmpty === true && value?.length) return false;`)
    .writeLine(`if (scalarListFilter.isEmpty === false && value?.length === 0) return false;`);
}
