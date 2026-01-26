import { Model } from "src/fileCreators/types";
import type CodeBlockWriter from "code-block-writer";

export function addBytesListFilter(writer: CodeBlockWriter, models: readonly Model[]) {
  const bytesListFields = models
    .flatMap(({ fields }) => fields)
    .filter((field) => field.type === "Bytes" && field.isList);
  if (bytesListFields.length === 0) return;

  writer
    .writeLine(
      `export function whereBytesListFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(record: R, fieldName: keyof R, scalarListFilter: undefined | Prisma.BytesNullableListFilter<unknown>): boolean`,
    )
    .block(() => {
      writer
        .writeLine(`if (scalarListFilter === undefined) return true;`)
        .blankLine()
        .writeLine(`const value = record[fieldName] as Uint8Array[] | undefined;`)
        .writeLine(`const areUint8ArraysEqual = (a: Uint8Array, b: Uint8Array) => {`)
        .writeLine(`  if (a.length !== b.length) return false;`)
        .writeLine(`  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;`)
        .writeLine(`  return true;`)
        .writeLine(`};`)
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
      .writeLine(`if (!scalarListFilter.equals.every((val, i) => areUint8ArraysEqual(val, value[i]))) return false;`);
  });
}

function addHasHandler(writer: CodeBlockWriter) {
  writer
    .writeLine(`if (scalarListFilter.has instanceof Uint8Array)`)
    .block(() => {
      writer.writeLine(
        `if (!value?.some((v) => areUint8ArraysEqual(v, scalarListFilter.has as Uint8Array))) return false;`,
      );
    })
    .writeLine(`if (scalarListFilter.has === null) return false;`);
}

function addHasSomeHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(scalarListFilter.hasSome))`).block(() => {
    writer.writeLine(
      `if (!scalarListFilter.hasSome.some((val) => value?.some((v) => val instanceof Uint8Array && areUint8ArraysEqual(v, val)))) return false;`,
    );
  });
}

function addHasEveryHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(scalarListFilter.hasEvery))`).block(() => {
    writer.writeLine(
      `if (!scalarListFilter.hasEvery.every((val) => val instanceof Uint8Array && value?.some((v) => areUint8ArraysEqual(v, val)))) return false;`,
    );
  });
}

function addIsEmptyHandler(writer: CodeBlockWriter) {
  writer
    .writeLine(`if (scalarListFilter.isEmpty === true && value?.length) return false;`)
    .writeLine(`if (scalarListFilter.isEmpty === false && value?.length === 0) return false;`);
}
