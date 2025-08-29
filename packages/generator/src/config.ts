import z from "zod";

const configBoolean = z.enum(["true", "false"]).transform((arg) => Boolean(arg));

export const externalConfigSchema = z.object({
  autoDeletedAtFilter: configBoolean.default("false"),
  autoVersionBump: configBoolean.default("false"),
  createOutboxTable: configBoolean.default("false"),
});

export type ExternalConfig = z.infer<typeof externalConfigSchema>;
