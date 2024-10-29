import { ClassDeclaration, CodeBlockWriter, SourceFile } from "ts-morph";
import { addCreateMethod } from "./CRUD/create";
import { addCreateManyMethod } from "./CRUD/createMany";
import { addDeleteMethod } from "./CRUD/delete";
import { addDeleteManyMethod } from "./CRUD/deleteMany";
import { addFindFirstMethod } from "./CRUD/findFirst";
import { addFindManyMethod } from "./CRUD/findMany";
import { FunctionalDefaultValue, Model } from "./types";
import { getModelFieldData, toCamelCase } from "./utils";
import { addFindUniqueMethod } from "./CRUD/findUnique";
import { addUpdateMethod } from "./CRUD/update";

export function addModelClass(file: SourceFile, model: Model) {
  const modelClass = file.addClass({ name: `IDB${model.name}`, extends: "BaseIDBModelClass" });
  addFillDefaultsFunction(modelClass, model);

  // Find methods
  addFindManyMethod(modelClass, model);
  addFindFirstMethod(modelClass, model);
  addFindUniqueMethod(modelClass, model);

  // Create methods
  addCreateMethod(modelClass, model);
  addCreateManyMethod(modelClass, model);

  // Delete methods
  addDeleteMethod(modelClass, model);
  addDeleteManyMethod(modelClass, model);

  // Update methods
  addUpdateMethod(modelClass, model);
}

function addFillDefaultsFunction(modelClass: ClassDeclaration, model: Model) {
  const { fieldsWithDefaultValue, allRequiredFieldsHaveDefaults } = getModelFieldData(model);

  // Exit early if no fields have default values
  if (fieldsWithDefaultValue.length === 0) return;

  modelClass.addMethod({
    name: "fillDefaults",
    isAsync: true,
    parameters: [
      {
        name: allRequiredFieldsHaveDefaults ? "data?" : "data",
        type: `Prisma.XOR<Prisma.${model.name}CreateInput, Prisma.${model.name}UncheckedCreateInput>`,
      },
    ],
    statements: (writer) => {
      if (allRequiredFieldsHaveDefaults) writer.writeLine("if (!data) data = {};");

      fieldsWithDefaultValue.forEach((field) => {
        const defaultValue = field.default!;
        const dataField = `data.${field.name}`;

        writer.writeLine(`if (${dataField} === undefined) {`);
        writer.indent(() => {
          if (Array.isArray(defaultValue)) {
            writer.writeLine(`${dataField} = [${defaultValue.toString()}];`);
          } else if (typeof defaultValue === "object" && "name" in defaultValue) {
            handleObjectDefault(writer, defaultValue, model, dataField);
          } else if (typeof defaultValue === "string") {
            writer.writeLine(`${dataField} = "${defaultValue}";`);
          } else {
            writer.writeLine(`${dataField} = ${defaultValue};`);
          }
        });
        writer.writeLine("}");
      });

      writer.writeLine("return data;");
    },
  });
}

function handleObjectDefault(
  writer: CodeBlockWriter,
  defaultValue: FunctionalDefaultValue,
  model: Model,
  dataField: string,
) {
  const defaultName = defaultValue.name;

  switch (defaultName) {
    case "cuid":
      writer.writeLine(`${dataField} = createId();`);
      break;
    case "uuid(4)":
      writer.writeLine(`${dataField} = uuidv4();`);
      break;
    case "autoincrement":
      writer
        .writeLine(`const transaction = this.client.db.transaction("${toCamelCase(model.name)}", 'readonly');`)
        .writeLine(`const store = transaction.objectStore("${toCamelCase(model.name)}");`)
        .writeLine("const cursor = await store.openCursor(null, 'prev');")
        .writeLine("if (cursor) {")
        .indent(() => writer.writeLine(`${dataField} = Number(cursor.key) + 1;`))
        .writeLine("} else {")
        .indent(() => writer.writeLine(`${dataField} = 1;`))
        .writeLine("}");
      break;
    default:
      throw new Error(`Default ${defaultName} is not yet supported`);
  }
}
