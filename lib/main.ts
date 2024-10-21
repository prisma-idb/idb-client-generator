import prismaInternals from "@prisma/internals";

type IDBSchemaModel = Record<
  string,
  { key: string; value: Record<string, string> }
>;

const typeMapping = new Map([
  ["String", "string"],
  ["Int", "number"],
  ["Float", "number"],
  ["Boolean", "boolean"],
  ["DateTime", "Date"],
]);

function convertToInterface(schema: IDBSchemaModel): string {
  let result = `import type { DBSchema } from "idb";\n\n`;
  result += `interface MyDB extends DBSchema {\n`;

  for (const modelName in schema) {
    const model = schema[modelName];
    result += `  ${modelName.toLowerCase()}: {\n`;
    result += `    key: ${model.key};\n`;

    result += `    value: {\n`;
    for (const field in model.value) {
      result += `      ${field}: ${model.value[field]};\n`;
    }
    result += `    };\n`;

    // TODO: support indexing
    // if (model.indexes) {
    //   result += `    indexes: {\n`;
    //   for (const index in model.indexes) {
    //     result += `      '${index}': ${model.indexes[index]};\n`;
    //   }
    //   result += `    };\n`;
    // }
    // result += `  };\n`;
  }

  result += `}\n`;

  return result;
}

export async function createTIDB(
  datamodelPath: string,
): Promise<IDBSchemaModel> {
  const schema: Record<string, { key: string; value: Record<string, string> }> =
    {};
  const dmmf = await prismaInternals.getDMMF({ datamodelPath });

  dmmf.datamodel.models.forEach((model) => {
    const key = model.fields.find(({ isId }) => isId);
    if (!key) throw new Error(`No id field found for model: ${model.name}`);

    const mappedKeyType = typeMapping.get(key.type);
    if (!mappedKeyType) {
      throw new Error(`Prisma type ${key.type} is not yet supported`);
    }

    const value: Record<string, string> = {};
    model.fields.forEach((field) => {
      if (field.kind === "object") return;

      const mappedType = typeMapping.get(field.type);
      if (!mappedType) {
        throw new Error(`Prisma type ${field.type} is not yet supported`);
      }

      value[field.name] = mappedType;
    });

    schema[model.name] = { key: mappedKeyType, value };
  });

  const tsTypes = convertToInterface(schema);
  Deno.writeTextFileSync("lib/idbSchema.d.ts", tsTypes);
  return schema;
}

console.log(await createTIDB("./lib/prisma/schema.prisma"));
