import type CodeBlockWriter from "code-block-writer";
import { getUniqueIdentifiers } from "../../helpers/utils";
import { Model } from "../types";
import { generateSlimModelValidator } from "../batch-processor/model-validator";

export function createValidatorsFile(writer: CodeBlockWriter, models: readonly Model[]) {
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
        const fieldValidators = generateSlimModelValidator(model);
        fieldValidators.forEach(({ field, zodType }) => {
          writer.writeLine(`${field.name}: ${zodType},`);
        });
      })
      .writeLine(`),`);
  });
  writer.writeLine(`} as const;`);
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
}
