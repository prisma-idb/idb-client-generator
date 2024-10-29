import { DMMF, ReadonlyDeep } from "@prisma/generator-helper";

export type Model = DMMF.Datamodel["models"][number];

export type Field = Model["fields"][number];

export type FunctionalDefaultValue = ReadonlyDeep<{
  name: string;
  args: unknown[];
}>;

export const prismaToJsTypes = new Map([
  ["String", "string"],
  ["Boolean", "boolean"],
  ["Int", "number"],
  ["BigInt", "bigint"],
  ["Float", "number"],
  ["Decimal", "string"],
  ["DateTime", "Date"],
  ["Json", "object"],
  ["Bytes", "Buffer"],
  ["Unsupported", "unknown"],
]);
