import { DMMF, ReadonlyDeep } from "@prisma/generator-helper";

export type Model = DMMF.Datamodel["models"][number];

export type Field = Model["fields"][number];

export type FunctionalDefaultValue = ReadonlyDeep<{
  name: string;
  args: unknown[];
}>;
