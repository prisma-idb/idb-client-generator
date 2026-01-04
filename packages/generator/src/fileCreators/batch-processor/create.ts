import type CodeBlockWriter from "code-block-writer";
import { getUniqueIdentifiers } from "../../helpers/utils";
import { Model } from "../types";

export function createBatchProcessorFile(
  writer: CodeBlockWriter,
  models: readonly Model[],
  prismaClientImport: string,
  prismaSingletonImport: string | null = null,
) {
  const modelNames = models.map((m) => m.name);

  // Write imports
  writer.writeLine(`import { z, type ZodTypeAny } from "zod";`);
  writer.writeLine(`import type { OutboxEventRecord } from "../client/idb-interface";`);
  writer.writeLine(`import type { ChangeLog } from "${prismaClientImport}";`);
  writer.writeLine(`import { prisma } from "${prismaSingletonImport}";`);
  writer.writeLine(`import { validators, keyPathValidators } from "../validators";`);
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

  // Write LogsWithRecords type - maps model names to their record types
  writer.writeLine(`export type LogsWithRecords<V extends Partial<Record<string, ZodTypeAny>>> = {`);
  writer.writeLine(`  [M in keyof V & string]: Omit<ChangeLog, "model" | "keyPath"> & {`);
  writer.writeLine(`    model: M;`);
  writer.writeLine(`    keyPath: Array<string | number>;`);
  writer.writeLine(`    record?: z.infer<V[M]> | null;`);
  writer.writeLine(`  };`);
  writer.writeLine(`}[keyof V & string];`);
  writer.blankLine();

  // Write sync handler type
  writer.writeLine(`export interface SyncResult {`);
  writer.writeLine(`  id: string;`);
  writer.writeLine(`  oldKeyPath?: Array<string | number>;`);
  writer.writeLine(`  entityKeyPath: Array<string | number>;`);
  writer.writeLine(`  mergedRecord?: unknown;`);
  writer.writeLine(`  serverVersion?: number;`);
  writer.writeLine(`  error?: string | null;`);
  writer.writeLine(`}`);
  writer.blankLine();

  // Write applyPush function with switch cases per model
  writer.writeLine(`export async function applyPush(`);
  writer.writeLine(`  events: OutboxEventRecord[],`);
  writer.writeLine(`  scopeKey: string | ((event: OutboxEventRecord) => string),`);
  writer.writeLine(`  customValidation?: (event: EventsFor<typeof validators>) => boolean | Promise<boolean>,`);
  writer.writeLine(`): Promise<SyncResult[]> {`);
  writer.block(() => {
    writer.writeLine(`const results: SyncResult[] = [];`);
    writer.writeLine(`for (const event of events) {`);
    writer.writeLine(`  try {`);
    writer.writeLine(`    const resolvedScopeKey = typeof scopeKey === "function" ? scopeKey(event) : scopeKey;`);
    writer.writeLine(`    let result: SyncResult;`);
    writer.writeLine(`    switch (event.entityType) {`);

    // Generate switch case for each model
    models.forEach((model) => {
      generateModelSwitchCase(writer, model);
    });

    writer.writeLine(`      default:`);
    writer.writeLine(`        throw new Error(\`No sync handler for \${event.entityType}\`);`);
    writer.writeLine(`    }`);
    writer.writeLine(`    results.push(result);`);
    writer.writeLine(`  } catch (err) {`);
    writer.writeLine(`    const errorMessage = err instanceof Error ? err.message : "Unknown error";`);
    writer.writeLine(`    results.push({ id: event.id, error: errorMessage, entityKeyPath: event.entityKeyPath });`);
    writer.writeLine(`  }`);
    writer.writeLine(`}`);
    writer.writeLine(`return results;`);
  });
  writer.writeLine(`}`);
  writer.blankLine();

  // Write materializeLogs helper function
  writer.writeLine(`export async function materializeLogs(`);
  writer.writeLine(`  logs: Array<ChangeLog>,`);
  writer.writeLine(`): Promise<Array<LogsWithRecords<typeof validators>>> {`);
  writer.block(() => {
    writer.writeLine(`const validModelNames = [${modelNames.map((name) => `"${name}"`).join(", ")}];`);
    writer.writeLine(`const results: Array<LogsWithRecords<typeof validators>> = [];`);
    writer.writeLine(`for (const log of logs) {`);
    writer.writeLine(`  if (!validModelNames.includes(log.model)) {`);
    writer.writeLine(`    throw new Error(\`Unknown model: \${log.model}\`);`);
    writer.writeLine(`  }`);
    writer.writeLine(`  try {`);
    writer.writeLine(`    switch (log.model) {`);

    // Generate switch cases for fetching records
    models.forEach((model) => {
      const modelNameLower = model.name.charAt(0).toLowerCase() + model.name.slice(1);
      const pk = getUniqueIdentifiers(model)[0];
      const pkFields = JSON.parse(pk.keyPath) as string[];

      writer.writeLine(`      case "${model.name}": {`);
      writer.writeLine(`        const keyPathValidation = keyPathValidators.${model.name}.safeParse(log.keyPath);`);
      writer.writeLine(`        if (!keyPathValidation.success) {`);
      writer.writeLine(`          throw new Error("Invalid keyPath for ${model.name}");`);
      writer.writeLine(`        }`);
      writer.writeLine(`        const validKeyPath = keyPathValidation.data;`);
      writer.writeLine(`        const record = await prisma.${modelNameLower}.findUnique({`);
      writer.writeLine(`          where: ${generateWhereClause(pk.name, pkFields)},`);
      writer.writeLine(`        });`);
      writer.writeLine(`        results.push({ ...log, model: "${model.name}", keyPath: validKeyPath, record });`);
      writer.writeLine(`        break;`);
      writer.writeLine(`      }`);
    });

    writer.writeLine(`    }`);
    writer.writeLine(`  } catch (err) {`);
    writer.writeLine(`    const errorMessage = err instanceof Error ? err.message : "Unknown error";`);
    writer.writeLine(`    console.error(\`Failed to fetch record for \${log.model}:\`, errorMessage);`);

    writer.writeLine(`  }`);
    writer.writeLine(`}`);
    writer.writeLine(`return results;`);
  });
  writer.writeLine(`}`);
  writer.blankLine();

  // Generate sync handler functions for each model
  models.forEach((model) => {
    generateModelSyncHandler(writer, model);
  });
}

function generateModelSwitchCase(writer: CodeBlockWriter, model: Model) {
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
    writer.writeLine(`result = await sync${model.name}(event, validation.data, resolvedScopeKey);`);
    writer.writeLine(`break;`);
  });
  writer.writeLine(`      }`);
}

function generateModelSyncHandler(writer: CodeBlockWriter, model: Model) {
  const modelNameLower = model.name.charAt(0).toLowerCase() + model.name.slice(1);
  const pk = getUniqueIdentifiers(model)[0];
  const pkFields = JSON.parse(pk.keyPath) as string[];

  writer.writeLine(
    `async function sync${model.name}(event: OutboxEventRecord, data: z.infer<typeof validators.${model.name}>, scopeKey: string): Promise<SyncResult>`,
  );
  writer.block(() => {
    writer.writeLine(`const { id, entityKeyPath, operation } = event;`);
    writer.writeLine(`const keyPathValidation = keyPathValidators.${model.name}.safeParse(entityKeyPath);`);
    writer.writeLine(`if (!keyPathValidation.success) {`);
    writer.writeLine(`  throw new Error("Invalid entityKeyPath for ${model.name}");`);
    writer.writeLine(`}`);
    writer.blankLine();
    writer.writeLine(`const validKeyPath = keyPathValidation.data;`);
    writer.blankLine();
    writer.writeLine(`switch (operation) {`);

    // CREATE
    writer.writeLine(`  case "create": {`);
    writer.writeLine(`    const [result] = await prisma.$transaction([`);
    writer.writeLine(`      prisma.${modelNameLower}.create({ data }),`);
    writer.writeLine(`      prisma.changeLog.create({`);
    writer.writeLine(`        data: {`);
    writer.writeLine(`          model: "${model.name}",`);
    writer.writeLine(`          keyPath: validKeyPath,`);
    writer.writeLine(`          operation: "create",`);
    writer.writeLine(`          scopeKey,`);
    writer.writeLine(`        },`);
    writer.writeLine(`      }),`);
    writer.writeLine(`    ]);`);
    if (pkFields.length === 1) {
      writer.writeLine(`    const newKeyPath = [result.${pkFields[0]}];`);
    } else {
      writer.writeLine(`    const newKeyPath = [${pkFields.map((f) => `result.${f}`).join(", ")}];`);
    }
    writer.writeLine(`    return { id, entityKeyPath: newKeyPath, mergedRecord: result };`);
    writer.writeLine(`  }`);
    writer.blankLine();

    // UPDATE
    writer.writeLine(`  case "update": {`);
    writer.writeLine(`    if (!entityKeyPath) throw new Error("Missing entityKeyPath for update");`);
    writer.writeLine(`    const oldKeyPath = [...validKeyPath];`);
    writer.writeLine(`    const [result] = await prisma.$transaction([`);
    writer.writeLine(`      prisma.${modelNameLower}.update({`);
    writer.writeLine(`        where: ${generateWhereClause(pk.name, pkFields)},`);
    writer.writeLine(`        data,`);
    writer.writeLine(`      }),`);
    writer.writeLine(`      prisma.changeLog.create({`);
    writer.writeLine(`        data: {`);
    writer.writeLine(`          model: "${model.name}",`);
    writer.writeLine(`          keyPath: validKeyPath,`);
    writer.writeLine(`          oldKeyPath,`);
    writer.writeLine(`          operation: "update",`);
    writer.writeLine(`          scopeKey,`);
    writer.writeLine(`        },`);
    writer.writeLine(`      }),`);
    writer.writeLine(`    ]);`);

    if (pkFields.length === 1) {
      writer.writeLine(`    const newKeyPath = [result.${pkFields[0]}];`);
    } else {
      writer.writeLine(`    const newKeyPath = [${pkFields.map((f) => `result.${f}`).join(", ")}];`);
    }
    writer.writeLine(`    return { id, oldKeyPath, entityKeyPath: newKeyPath, mergedRecord: result };`);
    writer.writeLine(`  }`);
    writer.blankLine();

    // DELETE
    writer.writeLine(`  case "delete": {`);
    writer.writeLine(`    if (!entityKeyPath) throw new Error("Missing entityKeyPath for delete");`);
    writer.writeLine(`    await prisma.$transaction([`);
    writer.writeLine(`      prisma.${modelNameLower}.delete({`);
    writer.writeLine(`        where: ${generateWhereClause(pk.name, pkFields)},`);
    writer.writeLine(`      }),`);
    writer.writeLine(`      prisma.changeLog.create({`);
    writer.writeLine(`        data: {`);
    writer.writeLine(`          model: "${model.name}",`);
    writer.writeLine(`          keyPath: validKeyPath,`);
    writer.writeLine(`          operation: "delete",`);
    writer.writeLine(`          scopeKey,`);
    writer.writeLine(`        },`);
    writer.writeLine(`      }),`);
    writer.writeLine(`    ]);`);
    writer.writeLine(`    return { id, entityKeyPath: validKeyPath };`);
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
