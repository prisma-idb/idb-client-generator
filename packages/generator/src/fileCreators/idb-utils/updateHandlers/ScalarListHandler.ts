import type { Model } from "src/fileCreators/types";
import type { CodeBlockWriter } from "ts-morph";

export function addScalarListUpdateHandler(writer: CodeBlockWriter, models: readonly Model[]) {
  const scalarListFields = models
    .flatMap(({ fields }) => fields)
    .filter((field) => field.isList && field.kind !== "object");
  if (scalarListFields.length === 0) return;

  writer
    .writeLine(
      `export function handleScalarListUpdateField<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(`,
    )
    .writeLine(`  record: R,`)
    .writeLine(`  fieldName: keyof R,`)
    .writeLine(`  listUpdate: undefined | unknown[] | { set?: unknown[]; push?: unknown | unknown[] },`)
    .writeLine(`): void`)
    .block(() => {
      writer
        .writeLine(`if (listUpdate === undefined) return;`)
        .write(`if (Array.isArray(listUpdate))`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as unknown[] | undefined) = listUpdate;`);
        })
        .writeLine(`else if (listUpdate.set !== undefined)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as unknown[] | undefined) = listUpdate.set;`);
        })
        .writeLine(`else if (listUpdate.push !== undefined)`)
        .block(() => {
          writer
            .writeLine(`if (Array.isArray(record[fieldName]))`)
            .block(() => {
              writer.writeLine(`record[fieldName].push(...convertToArray(listUpdate.push));`);
            })
            .writeLine(`else`)
            .block(() => {
              writer.writeLine(`(record[fieldName] as unknown[]) = convertToArray(listUpdate.push);`);
            });
        });
    });
}
