import type CodeBlockWriter from "code-block-writer";
import { getUniqueIdentifiers } from "../../helpers/utils";
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
  const includedModels = models.filter((m) => includedModelNames.includes(m.name));

  // Write imports
  writer.writeLine(`import { z, type ZodTypeAny } from "zod";`);
  writer.writeLine(`import type { OutboxEventRecord, PrismaIDBSchema } from "../client/idb-interface";`);
  writer.writeLine(`import { prisma } from "$lib/prisma";`);

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

  // Write sync handler type
  writer.writeLine(`export interface SyncResult {`);
  writer.writeLine(`  id: string;`);
  writer.writeLine(`  entityKeyPath: PrismaIDBSchema[keyof PrismaIDBSchema]["key"];`);
  writer.writeLine(`  mergedRecord?: any;`);
  writer.writeLine(`  serverVersion?: number;`);
  writer.writeLine(`  error?: string | null;`);
  writer.writeLine(`}`);
  writer.blankLine();

  // Write applySyncBatch function with switch cases per model
  writer.writeLine(`export async function applySyncBatch(`);
  writer.writeLine(`  events: OutboxEventRecord[],`);
  writer.writeLine(`  customValidation?: (event: EventsFor<typeof validators>) => boolean | Promise<boolean>,`);
  writer.writeLine(`): Promise<SyncResult[]> {`);
  writer.block(() => {
    writer.writeLine(`const results: SyncResult[] = [];`);
    writer.writeLine(`for (const event of events) {`);
    writer.writeLine(`  try {`);
    writer.writeLine(`    switch (event.entityType) {`);

    // Generate switch case for each model
    includedModels.forEach((model) => {
      generateModelSwitchCase(writer, model);
    });

    writer.writeLine(`        default:`);
    writer.writeLine(`          throw new Error(\`No sync handler for \${event.entityType}\`);`);
    writer.writeLine(`      }`);
    writer.writeLine(`  } catch (err) {`);
    writer.writeLine(`    const errorMessage = err instanceof Error ? err.message : "Unknown error";`);
    writer.writeLine(`    results.push({ id: event.id, error: errorMessage, entityKeyPath: event.entityKeyPath });`);
    writer.writeLine(`  }`);
    writer.writeLine(`}`);
    writer.writeLine(`return results;`);
  });
  writer.writeLine(`}`);
  writer.blankLine();

  // Generate sync handler functions for each model
  includedModels.forEach((model) => {
    generateModelSyncHandler(writer, model);
  });
}

function generateModelSwitchCase(writer: CodeBlockWriter, model: Model) {
  const pk = getUniqueIdentifiers(model)[0];
  const pkFields = JSON.parse(pk.keyPath) as string[];

  writer.writeLine(`      case "${model.name}": {`);
  writer.block(() => {
    writer.writeLine(`const validation = validators.${model.name}.safeParse(event.payload);`);
    writer.writeLine(`if (!validation.success) throw new Error(\`Validation failed: \${validation.error.message}\`);`);
    writer.blankLine();
    writer.writeLine(`if (customValidation) {`);
    writer.writeLine(`  const ok = await customValidation(event as EventsFor<typeof validators>);`);
    writer.writeLine(`  if (!ok) throw new Error("custom validation failed");`);
    writer.writeLine(`}`);
    writer.blankLine();
    writer.writeLine(`const result = await sync${model.name}(event, validation.data);`);
    writer.writeLine(`results.push(result);`);
  });
  writer.writeLine(`      break;`);
  writer.writeLine(`      }`);
}

function generateModelSyncHandler(writer: CodeBlockWriter, model: Model) {
  const modelNameLower = model.name.charAt(0).toLowerCase() + model.name.slice(1);
  const pk = getUniqueIdentifiers(model)[0];
  const pkFields = JSON.parse(pk.keyPath) as string[];

  writer.writeLine(
    `async function sync${model.name}(event: OutboxEventRecord, data: z.infer<typeof validators.${model.name}>): Promise<SyncResult>`,
  );
  writer.block(() => {
    writer.writeLine(`const { id, entityKeyPath, operation } = event;`);
    writer.writeLine(
      `const keyPathValidation = z.safeParse(z.tuple([${pkFields.map((_, i) => `z.${pk.keyPathTypes[i]}()`).join(", ")}]), entityKeyPath);`,
    );
    writer.writeLine(`if (!keyPathValidation.success) {`);
    writer.writeLine(`  throw new Error("Invalid entityKeyPath for ${model.name}");`);
    writer.writeLine(`}`);
    writer.blankLine();
    writer.writeLine(`const validKeyPath = keyPathValidation.data;`);
    writer.blankLine();
    writer.writeLine(`switch (operation) {`);

    // CREATE
    writer.writeLine(`  case "create": {`);
    writer.writeLine(`    const result = await prisma.${modelNameLower}.create({ data });`);

    if (pkFields.length === 1) {
      writer.writeLine(`    return { id, entityKeyPath: [result.${pkFields[0]}], mergedRecord: result };`);
    } else {
      writer.writeLine(
        `    return { id, entityKeyPath: [${pkFields.map((f) => `result.${f}`).join(", ")}], mergedRecord: result };`,
      );
    }
    writer.writeLine(`  }`);
    writer.blankLine();

    // UPDATE
    writer.writeLine(`  case "update": {`);
    writer.writeLine(`    if (!entityKeyPath) throw new Error("Missing entityKeyPath for update");`);
    writer.writeLine(`    const result = await prisma.${modelNameLower}.update({`);
    writer.writeLine(`      where: ${generateWhereClause(pk.name, pkFields)},`);
    writer.writeLine(`      data,`);
    writer.writeLine(`    });`);

    if (pkFields.length === 1) {
      writer.writeLine(`    return { id, entityKeyPath: [result.${pkFields[0]}], mergedRecord: result };`);
    } else {
      writer.writeLine(
        `    return { id, entityKeyPath: [${pkFields.map((f) => `result.${f}`).join(", ")}], mergedRecord: result };`,
      );
    }
    writer.writeLine(`  }`);
    writer.blankLine();

    // DELETE
    writer.writeLine(`  case "delete": {`);
    writer.writeLine(`    if (!entityKeyPath) throw new Error("Missing entityKeyPath for delete");`);
    writer.writeLine(`    await prisma.${modelNameLower}.delete({`);
    writer.writeLine(`      where: ${generateWhereClause(pk.name, pkFields)},`);
    writer.writeLine(`    });`);
    writer.writeLine(`    return { id, entityKeyPath };`);
    writer.writeLine(`  }`);
    writer.blankLine();

    writer.writeLine(`  default:`);
    writer.writeLine(`    throw new Error(\`Unknown operation: \${operation}\`);`);
    writer.writeLine(`}`);
  });
  writer.blankLine();
}

function generateWhereClause(pkName: string, pkFields: string[]): string {
  if (pkFields.length === 1) {
    return `{ ${pkFields[0]}: validKeyPath[0] }`;
  } else {
    const compositeKey = pkFields.map((field, i) => `${field}: validKeyPath[${i}]`).join(", ");
    return `{ ${pkName}: { ${compositeKey} } }`;
  }
}
