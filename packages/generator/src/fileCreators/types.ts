import { DMMF } from "@prisma/generator-helper";

export type Model = DMMF.Datamodel["models"][number];

export type Field = Model["fields"][number];

export type FunctionalDefaultValue = {
  name: string;
  args: unknown[];
};
