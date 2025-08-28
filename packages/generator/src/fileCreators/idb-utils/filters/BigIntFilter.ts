import type { Model } from "src/fileCreators/types";
import type { CodeBlockWriter } from "ts-morph";

export function addBigIntFilter(writer: CodeBlockWriter, models: readonly Model[]) {
  const bigIntFields = models.flatMap(({ fields }) => fields).filter((field) => field.type === "BigInt");
  if (bigIntFields.length === 0) return;

  const nonNullableBigIntFieldPresent = bigIntFields.some(({ isRequired }) => isRequired);
  const nullableBigIntFieldPresent = bigIntFields.some(({ isRequired }) => !isRequired);

  let filterType = "undefined | number | bigint";
  if (nonNullableBigIntFieldPresent) {
    filterType += " | Prisma.BigIntFilter<unknown>";
  }
  if (nullableBigIntFieldPresent) {
    filterType += " | null | Prisma.BigIntNullableFilter<unknown>";
  }

  writer
    .writeLine(`export function whereBigIntFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(`)
    .writeLine(`record: R,`)
    .writeLine(`fieldName: keyof R,`)
    .writeLine(`bigIntFilter: ${filterType},`)
    .writeLine(`): boolean`)
    .block(() => {
      writer
        .writeLine(`if (bigIntFilter === undefined) return true;`)
        .blankLine()
        .writeLine(`const value = record[fieldName] as number | null;`)
        .writeLine(`if (bigIntFilter === null) return value === null;`)
        .blankLine()
        .writeLine(`if (typeof bigIntFilter === 'number' || typeof bigIntFilter === 'bigint')`)
        .block(() => {
          writer.writeLine(`if (value !== bigIntFilter) return false;`);
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
    .writeLine(`if (bigIntFilter.equals === null)`)
    .block(() => {
      writer.writeLine(`if (value !== null) return false;`);
    })
    .writeLine(`if (typeof bigIntFilter.equals === "number" || typeof bigIntFilter.equals === "bigint")`)
    .block(() => {
      writer.writeLine(`if (bigIntFilter.equals != value) return false;`);
    });
}

function addNotHandler(writer: CodeBlockWriter) {
  writer
    .writeLine(`if (bigIntFilter.not === null)`)
    .block(() => {
      writer.writeLine(`if (value === null) return false;`);
    })
    .writeLine(`if (typeof bigIntFilter.not === "number" || typeof bigIntFilter.not === "bigint")`)
    .block(() => {
      writer.writeLine(`if (bigIntFilter.not == value) return false;`);
    });
}

function addInHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(bigIntFilter.in))`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(`if (!bigIntFilter.in.map((n) => BigInt(n)).includes(BigInt(value))) return false;`);
  });
}

function addNotInHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(bigIntFilter.notIn))`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(`if (bigIntFilter.notIn.map((n) => BigInt(n)).includes(BigInt(value))) return false;`);
  });
}

function addLtHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof bigIntFilter.lt === "number" || typeof bigIntFilter.lt === "bigint")`).block(() => {
    writer.writeLine(`if (value === null) return false;`).writeLine(`if (!(value < bigIntFilter.lt)) return false;`);
  });
}

function addLteHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof bigIntFilter.lte === "number" || typeof bigIntFilter.lte === "bigint")`).block(() => {
    writer.writeLine(`if (value === null) return false;`).writeLine(`if (!(value <= bigIntFilter.lte)) return false;`);
  });
}

function addGtHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof bigIntFilter.gt === "number" || typeof bigIntFilter.gt === "bigint")`).block(() => {
    writer.writeLine(`if (value === null) return false;`).writeLine(`if (!(value > bigIntFilter.gt)) return false;`);
  });
}

function addGteHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof bigIntFilter.gte === "number" || typeof bigIntFilter.gte === "bigint")`).block(() => {
    writer.writeLine(`if (value === null) return false;`).writeLine(`if (!(value >= bigIntFilter.gte)) return false;`);
  });
}
