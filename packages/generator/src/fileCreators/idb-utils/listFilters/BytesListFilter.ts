import { Model } from "src/fileCreators/types";
import type { CodeBlockWriter } from "ts-morph";

export function addBytesListFilter(writer: CodeBlockWriter, models: readonly Model[]) {
  const bytesListFields = models
    .flatMap(({ fields }) => fields)
    .filter((field) => field.type === "Bytes" && field.isList);
  if (bytesListFields.length === 0) return;

  writer
    .writeLine(`export function whereBytesListFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(`)
    .writeLine(`record: R,`)
    .writeLine(`fieldName: keyof R,`)
    .writeLine(`scalarListFilter: undefined | Prisma.BytesNullableListFilter<unknown>,`)
    .writeLine(`): boolean`)
    .block(() => {
      writer
        .writeLine(`if (scalarListFilter === undefined) return true;`)
        .blankLine()
        .writeLine(`const value = record[fieldName] as Uint8Array[] | undefined;`)
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
    .writeLine(`if (scalarListFilter.has instanceof Uint8Array)`)
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
