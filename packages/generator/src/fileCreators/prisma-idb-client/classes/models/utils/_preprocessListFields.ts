import { Model } from "src/fileCreators/types";
import { CodeBlockWriter } from "ts-morph";

export function addPreprocessListFields(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(
      `private _preprocessListFields(records: Prisma.Result<Prisma.${model.name}Delegate, object, "findMany">): void`,
    )
    .block(() => {
      addUndefinedScalarListPreprocessing(writer, model);
    });
}

function addUndefinedScalarListPreprocessing(writer: CodeBlockWriter, model: Model) {
  const scalarListFields = model.fields.filter((field) => field.isList && field.kind !== "object");
  if (scalarListFields.length === 0) return;
  writer.writeLine(`for (const record of records)`).block(() => {
    for (const field of scalarListFields) {
      writer.writeLine(`record.${field.name} = record.${field.name} ?? [];`);
    }
  });
}
