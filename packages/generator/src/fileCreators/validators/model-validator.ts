import type { DMMF } from "@prisma/generator-helper";
import { Field, Model } from "../types";

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

export function generateSlimModelValidator(model: Model, enums: readonly DMMF.DatamodelEnum[]) {
  const scalarAndEnumFields = model.fields.filter((field) => field.kind === "scalar" || field.kind === "enum");

  return scalarAndEnumFields.map((field) => {
    if (field.kind === "scalar") {
      return handleScalarField(model, field);
    }
    if (field.kind === "enum") {
      return handleEnumField(field, enums);
    }
    throw new Error(`Unsupported field kind: ${field.kind} in model: ${model.name}`);
  });
}

function handleScalarField(model: Model, field: Field) {
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

  if (!field.isRequired) {
    zodType += ".nullable()";
  }

  return { field, zodType };
}

function handleEnumField(field: Field, enums: readonly DMMF.DatamodelEnum[]) {
  const enumDef = enums.find((e) => e.name === field.type);
  if (!enumDef) {
    throw new Error(`Enum type ${field.type} not found for field ${field.name}`);
  }

  let zodType = "z.";
  if (field.isList) {
    zodType += `array(z.enum([${enumDef.values.map((val) => `"${val.name}"`).join(", ")}]))`;
  } else {
    zodType += `enum([${enumDef.values.map((val) => `"${val.name}"`).join(", ")}])`;
  }

  if (!field.isRequired) {
    zodType += ".nullable()";
  }

  return { field, zodType };
}
