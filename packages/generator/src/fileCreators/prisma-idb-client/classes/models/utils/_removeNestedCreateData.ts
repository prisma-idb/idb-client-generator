import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../types";

export function addRemoveNestedCreateDataMethod(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(
      `private _removeNestedCreateData<D extends Prisma.Args<Prisma.${model.name}Delegate, "create">["data"]>(`
    )
    .writeLine(`data: D`)
    .writeLine(`): Prisma.Result<Prisma.${model.name}Delegate, object, "findFirstOrThrow">`)
    .block(() => {
      writer.writeLine(`const recordWithoutNestedCreate = structuredClone(data);`);
      addRelationProcessing(writer, model);
      writer.writeLine(
        `return recordWithoutNestedCreate as Prisma.Result<Prisma.${model.name}Delegate, object, "findFirstOrThrow">;`
      );
    });
}

function addRelationProcessing(writer: CodeBlockWriter, model: Model) {
  const relationFields = model.fields.filter(({ kind }) => kind === "object");
  relationFields.forEach((field) => {
    writer.writeLine(`delete recordWithoutNestedCreate?.${field.name};`);
  });
}
