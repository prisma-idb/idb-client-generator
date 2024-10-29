import { DMMF, ReadonlyDeep } from "@prisma/generator-helper";

export type Model = DMMF.Datamodel["models"][number];

export type FunctionalDefaultValue = ReadonlyDeep<{
  name: string;
  args: unknown[];
}>;
