import { Model } from "src/fileCreators/types";
import { ClassDeclaration, CodeBlockWriter, Scope } from "ts-morph";

export function addPreprocessListFields(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "_preprocessListFields",
    scope: Scope.Private,
    parameters: [{ name: "records", type: `Prisma.Result<Prisma.${model.name}Delegate, object, "findMany">` }],
    returnType: "void",
    statements: (writer) => addUndefinedScalarListPreprocessing(writer, model),
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
