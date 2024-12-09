import type { Model } from "src/fileCreators/types";
import type { SourceFile } from "ts-morph";

export function addScalarListUpdateHandler(utilsFile: SourceFile, models: readonly Model[]) {
  const scalarListFields = models
    .flatMap(({ fields }) => fields)
    .filter((field) => field.isList && field.kind !== "object");
  if (scalarListFields.length === 0) return;

  utilsFile.addFunction({
    name: "handleScalarListUpdateField",
    isExported: true,
    typeParameters: [{ name: "T" }, { name: "R", constraint: `Prisma.Result<T, object, "findFirstOrThrow">` }],
    parameters: [
      { name: "record", type: `R` },
      { name: "fieldName", type: "keyof R" },
      {
        name: "listUpdate",
        type: "undefined | unknown[] | { set?: unknown[]; push?: unknown | unknown[] }",
      },
    ],
    statements: (writer) => {
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
    },
  });
}
