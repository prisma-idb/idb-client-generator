import { Model } from "../types";

const fieldTypeToZodTypeMap: Record<string, string> = {
  String: "string()",
  BigInt: "bigint()",
  Boolean: "boolean()",
  DateTime: "date()",
  Float: "number()",
  Int: "number().int()",
  JSON: "any()",
  Bytes: "instanceof(Uint8Array)",
};

export function generateSlimModelValidator(model: Model) {
  const scalarFields = model.fields.filter((field) => field.kind === "scalar");

  return scalarFields.map((field) => {
    let zodType = "z.";
    const mappedType = fieldTypeToZodTypeMap[field.type];
    if (!mappedType) {
      throw new Error(`Unsupported field type: ${field.type} in model: ${model.name}`);
    }

    if (field.isList) {
      zodType += `array(${mappedType})`;
    } else {
      zodType += mappedType;
    }

    return { field, zodType };
  });
}
