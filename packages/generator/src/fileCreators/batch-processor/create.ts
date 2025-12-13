import type CodeBlockWriter from "code-block-writer";
import { Model } from "../types";

export function createBatchProcessorFile(
  writer: CodeBlockWriter,
  models: readonly Model[],
  prismaClientImport: string,
  usePrismaZodGenerator: boolean,
  include: string[] = ["*"],
  exclude: string[] = [],
) {
  // Determine which models to include based on include/exclude patterns
  const getIncludedModels = (models: readonly Model[], include: string[], exclude: string[]): string[] => {
    const isIncluded = (modelName: string) => {
      if (include[0] !== "*") {
        return include.some((pattern) => matchPattern(modelName, pattern));
      }
      return !exclude.some((pattern) => matchPattern(modelName, pattern));
    };

    return models.filter((m) => isIncluded(m.name)).map((m) => m.name);
  };

  const matchPattern = (name: string, pattern: string): boolean => {
    const globToRegex = (glob: string): RegExp => {
      const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      const withWildcard = escaped.replace(/\\\*/g, ".*");
      return new RegExp(`^${withWildcard}$`);
    };
    return globToRegex(pattern).test(name);
  };

  const includedModelNames = getIncludedModels(models, include, exclude);

  // Write imports
  writer.writeLine(`import type { StoreNames } from "idb";`);
  writer.writeLine(`import { z, type ZodTypeAny } from "zod";`);
  writer.writeLine(`import type { OutboxEventRecord, PrismaIDBSchema } from "../client/idb-interface";`);

  if (usePrismaZodGenerator) {
    writer.writeLine(
      `import { ${includedModelNames.map((name) => `${name}Schema`).join(", ")} } from "$lib/generated/prisma-zod-generator/schemas/models";`,
    );
  }

  writer.blankLine();

  // Write Op type
  writer.writeLine(`type Op = "create" | "update" | "delete";`);
  writer.blankLine();

  // Write EventsFor type - needs to be a raw string to handle mapped types properly
  writer.writeLine(`type EventsFor<V extends Partial<Record<string, ZodTypeAny>>> = {`);
  writer.writeLine(`  [M in keyof V & string]: {`);
  writer.writeLine(`    [O in Op]: {`);
  writer.writeLine(`      entityType: M;`);
  writer.writeLine(`      operation: O;`);
  writer.writeLine(`      payload: z.infer<V[M]>;`);
  writer.writeLine(`    };`);
  writer.writeLine(`  }[Op];`);
  writer.writeLine(`}[keyof V & string];`);
  writer.blankLine();

  // Write validators constant
  writer.writeLine(`const validators = {`);
  includedModelNames.forEach((modelName) => {
    if (usePrismaZodGenerator) {
      writer.writeLine(`  ${modelName}: ${modelName}Schema,`);
    } else {
      writer.writeLine(`  // ${modelName}: z.object({ /* define schema */ }),`);
    }
  });
  writer.writeLine(`} as const;`);
  writer.blankLine();

  // Write allModels set
  writer.writeLine(`const allModels = new Set<string>([`);
  includedModelNames.forEach((modelName) => {
    writer.writeLine(`"${modelName}",`);
  });
  writer.writeLine(`]);`);
  writer.blankLine();

  // Write processBatch function
  writer.writeLine(`export function processBatch(`);
  writer.writeLine(`  batch: OutboxEventRecord[],`);
  writer.writeLine(`  customValidation?: (event: EventsFor<typeof validators>) => boolean | Promise<boolean>,`);
  writer.writeLine(`)`);
  writer.block(() => {
    writer.writeLine(`return batch.map((event) => {`);
    writer.writeLine(`if (!allModels.has(event.entityType)) {`);
    writer.writeLine(`  throw new Error(\`Unknown entity type: \${event.entityType}\`);`);
    writer.writeLine(`}`);
    writer.blankLine();

    writer
      .writeLine(`const modelName = event.entityType as StoreNames<PrismaIDBSchema>;`)
      .writeLine(`const validator = validators[modelName as keyof typeof validators];`)
      .writeLine(`if (!validator) throw new Error(\`No validator for model \${modelName}\`);`);
    writer.blankLine();

    writer.writeLine(`const result = validator.safeParse(event.payload);`);
    writer.writeLine(`if (!result.success) throw new Error(\`Validation failed: \${result.error.message}\`);`);
    writer.blankLine();

    writer.writeLine(`if (customValidation) {`);
    writer.writeLine(`  const ok = customValidation(event as unknown as EventsFor<typeof validators>);`);
    writer.writeLine(`  if (ok instanceof Promise) {`);
    writer.writeLine(`    throw new Error("async customValidation used but processBatch is sync");`);
    writer.writeLine(`  }`);
    writer.writeLine(`  if (!ok) throw new Error("custom validation failed");`);
    writer.writeLine(`}`);
    writer.blankLine();

    writer.writeLine(`return event;`);
    writer.writeLine(`});`);
  });
}
