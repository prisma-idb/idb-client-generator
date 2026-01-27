import type CodeBlockWriter from "code-block-writer";
import { getUniqueIdentifiers } from "../../helpers/utils";
import { Model } from "../types";
import { generateSlimModelValidator } from "./model-validator";
import type { DMMF } from "@prisma/generator-helper";

export function createValidatorsFile(
  writer: CodeBlockWriter,
  models: readonly Model[],
  enums: readonly DMMF.DatamodelEnum[],
) {
  const modelNames = models.map((m) => m.name);

  // Write imports
  writer.writeLine(`import { z } from "zod";`);
  writer.blankLine();

  // Write validators constant
  writer.writeLine(`export const validators = {`);
  modelNames.forEach((modelName) => {
    writer
      .writeLine(`  ${modelName}: z.strictObject(`)
      .block(() => {
        const model = models.find((m) => m.name === modelName)!;
        const fieldValidators = generateSlimModelValidator(model, enums);
        fieldValidators.forEach(({ field, zodType }) => {
          writer.writeLine(`${field.name}: ${zodType},`);
        });
      })
      .writeLine(`),`);
  });
  writer.writeLine(`} as const;`);
  writer.blankLine();

  // Write outbox event schema
  writer.writeLine(`export const outboxEventSchema = z.strictObject({`);
  writer.writeLine(`  id: z.string(),`);
  writer.writeLine(`  entityType: z.string(),`);
  writer.writeLine(`  operation: z.enum(["create", "update", "delete"]),`);
  writer.writeLine(`  payload: z.record(z.string(), z.unknown()),`);
  writer.writeLine(`  createdAt: z.coerce.date(),`);
  writer.writeLine(`  tries: z.number(),`);
  writer.writeLine(`  lastError: z.string().nullable(),`);
  writer.writeLine(`  synced: z.boolean(),`);
  writer.writeLine(`  syncedAt: z.coerce.date().nullable(),`);
  writer.writeLine(`  retryable: z.boolean(),`);
  writer.writeLine(`});`);
  writer.blankLine();

  // Write keyPathValidators constant
  writer.writeLine(`export const keyPathValidators = {`);
  modelNames.forEach((modelName) => {
    const model = models.find((m) => m.name === modelName)!;
    const pk = getUniqueIdentifiers(model)[0];
    const pkFields = JSON.parse(pk.keyPath) as string[];
    const keyPathTuple = pkFields.map((_, i) => `z.${pk.keyPathTypes[i]}()`).join(", ");
    writer.writeLine(`  ${modelName}: z.tuple([${keyPathTuple}]),`);
  });
  writer.writeLine(`} as const;`);
  writer.blankLine();

  // Write modelRecordToKeyPath functions
  writer.writeLine(`export const modelRecordToKeyPath = {`);
  modelNames.forEach((modelName) => {
    const model = models.find((m) => m.name === modelName)!;
    const pk = getUniqueIdentifiers(model)[0];
    const pkFields = JSON.parse(pk.keyPath) as string[];

    writer.write(`  ${modelName}: (record: unknown) => `).block(() => {
      writer.writeLine(`const validated = validators.${modelName}.parse(record);`);
      writer.writeLine(`const keyPathArray = [${pkFields.map((field) => `validated.${field}`).join(", ")}] as const;`);
      writer.writeLine(`return keyPathValidators.${modelName}.parse(keyPathArray);`);
    });
    writer.writeLine(`,`);
  });
  writer.writeLine(`} as const;`);
}
