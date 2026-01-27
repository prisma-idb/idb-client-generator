import type CodeBlockWriter from "code-block-writer";
import { getUniqueIdentifiers } from "../../helpers/utils";
import { Model } from "../types";
import { createDAG } from "./createDAG";

export const pushErrorTypes = {
  INVALID_MODEL: "INVALID_MODEL",
  RECORD_VALIDATION_FAILURE: "RECORD_VALIDATION_FAILURE",
  KEYPATH_VALIDATION_FAILURE: "KEYPATH_VALIDATION_FAILURE",
  MISSING_PARENT: "MISSING_PARENT",
  SCOPE_VIOLATION: "SCOPE_VIOLATION",
  UNKNOWN_OPERATION: "UNKNOWN_OPERATION",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  MAX_RETRIES: "MAX_RETRIES",
  CUSTOM_VALIDATION_FAILED: "CUSTOM_VALIDATION_FAILED",
} as const;

/**
 * Helper function to build authorization paths from root model to a target model.
 * Returns the chain of relation fields needed to traverse from target to root.
 */
function buildAuthorizationPath(
  targetModel: string,
  rootModel: string,
  models: readonly Model[],
  dag: Record<string, Set<string>>,
): string[] {
  if (targetModel === rootModel) {
    return [];
  }

  const path: string[] = [];
  const visited = new Set<string>();
  const modelMap = new Map(models.map((m) => [m.name, m]));

  const dfs = (current: string): boolean => {
    if (current === rootModel) return true;
    visited.add(current);

    const model = modelMap.get(current);
    if (!model) return false;

    // Find relation fields that point to a model in the DAG
    const relationFields = model.fields.filter((f) => f.kind === "object" && !f.isList && dag[f.type]);

    for (const field of relationFields) {
      if (!visited.has(field.type) && dfs(field.type)) {
        path.unshift(field.name);
        return true;
      }
    }

    return false;
  };

  dfs(targetModel);
  return path;
}

export function createBatchProcessorFile(
  writer: CodeBlockWriter,
  models: readonly Model[],
  prismaClientImport: string,
  rootModel: Model,
) {
  const modelNames = models.map((m) => m.name);

  // Write imports
  writer.writeLine(`import { z, type ZodTypeAny } from "zod";`);
  writer.writeLine(`import type { OutboxEventRecord } from "../client/idb-interface";`);
  writer.writeLine(`import type { ChangeLog } from "${prismaClientImport}";`);
  writer.writeLine(`import type { PrismaClient } from "${prismaClientImport}";`);
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

  // Write LogWithRecord type - maps model names to their record types
  writer.writeLine(`export type LogWithRecord<V extends Partial<Record<string, ZodTypeAny>>> = {`);
  writer.writeLine(`  [M in keyof V & string]: Omit<ChangeLog, "model" | "keyPath"> & {`);
  writer.writeLine(`    model: M;`);
  writer.writeLine(`    keyPath: Array<string | number>;`);
  writer.writeLine(`    record?: z.infer<V[M]> | null;`);
  writer.writeLine(`    changelogId: string;`);
  writer.writeLine(`  };`);
  writer.writeLine(`}[keyof V & string];`);
  writer.blankLine();

  // Error types
  writer.writeLine(`export const PushErrorTypes = `).block(() => {
    Object.entries(pushErrorTypes).forEach(([key, value]) => {
      writer.writeLine(`${key}: "${value}",`);
    });
  });
  writer.blankLine();

  // Write sync handler type
  writer.writeLine(`export interface PushResult {`);
  writer.writeLine(`  id: string;`);
  writer.writeLine(`  appliedChangelogId: string | null;`);
  writer.writeLine(`  error: null | `).block(() => {
    writer.writeLine(`type: keyof typeof PushErrorTypes;`);
    writer.writeLine(`message: string;`);
    writer.writeLine(`retryable: boolean;`);
  });
  writer.writeLine(`}`);
  writer.blankLine();

  // Write ApplyPushOptions type
  writer.writeLine(`export interface ApplyPushOptions {`);
  writer.writeLine(`  events: OutboxEventRecord[];`);
  writer.writeLine(`  scopeKey: string | ((event: OutboxEventRecord) => string);`);
  writer.writeLine(`  prisma: PrismaClient;`);
  writer.writeLine(`  customValidation?: (`);
  writer.writeLine(`    event: EventsFor<typeof validators>`);
  writer.writeLine(`  ) => { errorMessage: string | null } | Promise<{ errorMessage: string | null }>;`);
  writer.writeLine(`}`);
  writer.blankLine();

  // Permanent sync error type
  writer.writeLine(`export class PermanentSyncError extends Error `).block(() => {
    writer.writeLine(`readonly type: keyof typeof PushErrorTypes;`);

    writer.writeLine(`constructor(type: keyof typeof PushErrorTypes, message: string)`).block(() => {
      writer.writeLine(`super(message);`);
      writer.writeLine(`this.type = type;`);
      writer.writeLine(`Object.setPrototypeOf(this, PermanentSyncError.prototype);`);
    });
  });
  writer.blankLine();

  // Write MAX_BATCH_SIZE constant
  writer.writeLine(`const MAX_BATCH_SIZE = 100;`);
  writer.blankLine();

  // Write applyPush function with switch cases per model
  writer.writeLine(`export async function applyPush({`);
  writer.writeLine(`  events,`);
  writer.writeLine(`  scopeKey,`);
  writer.writeLine(`  prisma,`);
  writer.writeLine(`  customValidation,`);
  writer.writeLine(`}: ApplyPushOptions): Promise<PushResult[]>`);
  writer.block(() => {
    writer.writeLine(`if (events.length > MAX_BATCH_SIZE) {`);
    writer.writeLine(`  throw new Error(`);
    writer.writeLine(`    \`Batch size \${events.length} exceeds maximum allowed \${MAX_BATCH_SIZE}\``);
    writer.writeLine(`  );`);
    writer.writeLine(`}`);
    writer.blankLine();
    writer.writeLine(`const results: PushResult[] = [];`);
    writer.writeLine(`for (const event of events) {`);
    writer.writeLine(`  try {`);
    writer.writeLine(`    const resolvedScopeKey = typeof scopeKey === "function" ? scopeKey(event) : scopeKey;`);
    writer.writeLine(`    let result: PushResult;`);
    writer.writeLine(`    switch (event.entityType) {`);

    // Generate switch case for each model
    models.forEach((model) => {
      generateModelSwitchCase(writer, model);
    });

    writer.writeLine(`      default:`);
    writer.writeLine(
      `        throw new PermanentSyncError("${pushErrorTypes.INVALID_MODEL}", \`No sync handler for model \${event.entityType}\`);`,
    );
    writer.writeLine(`    }`);
    writer.writeLine(`    results.push(result);`);
    writer.writeLine(`  } catch (err) {`);
    writer.writeLine(`    const errorMessage = err instanceof Error ? err.message : "Unknown error";`);
    writer.writeLine(`    const isPermanent = err instanceof PermanentSyncError;`);
    writer.blankLine();
    writer.writeLine(`    console.error(\`[Sync Error] Event \${event.id}:\`, {`);
    writer.writeLine(`      entityType: event.entityType,`);
    writer.writeLine(`      operation: event.operation,`);
    writer.writeLine(`      error: err,`);
    writer.writeLine(`      stack: err instanceof Error ? err.stack : undefined,`);
    writer.writeLine(`    });`);
    writer.blankLine();
    writer
      .writeLine(`    results.push({ id: event.id, `)
      .writeLine(`    appliedChangelogId: null,`)
      .writeLine(`error: `)
      .block(() => {
        writer.writeLine(`type: isPermanent ? err.type : "UNKNOWN_ERROR",`);
        writer.writeLine(`message: isPermanent ? errorMessage : "An unexpected error occurred",`);
        writer.writeLine(`retryable: !isPermanent,`);
      })
      .writeLine(`});`);
    writer.writeLine(`  }`);
    writer.writeLine(`}`);
    writer.writeLine(`return results;`);
  });
  writer.blankLine();

  // Create DAG for authorization paths
  const dag = createDAG(models, rootModel);

  // Write materializeLogs helper function
  writer.writeLine(`export async function materializeLogs({`);
  writer.writeLine(`  logs,`);
  writer.writeLine(`  prisma,`);
  writer.writeLine(`  scopeKey,`);
  writer.writeLine(`}: {`);
  writer.writeLine(`  logs: Array<ChangeLog>;`);
  writer.writeLine(`  prisma: PrismaClient;`);
  writer.writeLine(`  scopeKey: string;`);
  writer.writeLine(`}): Promise<Array<LogWithRecord<typeof validators>>>`);
  writer.block(() => {
    writer.writeLine(`const validModelNames = [${modelNames.map((name) => `"${name}"`).join(", ")}];`);
    writer.writeLine(`const results: Array<LogWithRecord<typeof validators>> = [];`);
    writer.writeLine(`for (const log of logs) {`);
    writer.writeLine(`  if (!validModelNames.includes(log.model)) {`);
    writer.writeLine(`    throw new Error(\`Unknown model: \${log.model}\`);`);
    writer.writeLine(`  }`);
    writer.writeLine(`    switch (log.model) {`);

    // Generate switch cases for fetching records
    models.forEach((model) => {
      const modelNameLower = model.name.charAt(0).toLowerCase() + model.name.slice(1);
      const pk = getUniqueIdentifiers(model)[0];
      const pkFields = JSON.parse(pk.keyPath) as string[];
      const isRootModel = model.name === rootModel.name;
      const authPath = buildAuthorizationPath(model.name, rootModel.name, models, dag);

      writer.writeLine(`      case "${model.name}": {`);
      writer.writeLine(`        const keyPathValidation = keyPathValidators.${model.name}.safeParse(log.keyPath);`);
      writer.writeLine(`        if (!keyPathValidation.success) {`);
      writer.writeLine(`          throw new Error("Invalid keyPath for ${model.name}");`);
      writer.writeLine(`        }`);
      writer.writeLine(`        const validKeyPath = keyPathValidation.data;`);

      // Build select clause with all model fields
      const selectFields = model.fields
        .filter((f) => f.kind !== "object")
        .map((f) => `${f.name}: true`)
        .join(", ");

      if (isRootModel) {
        // For root model, check if validKeyPath matches scopeKey
        writer.writeLine(`        if (validKeyPath[0] !== scopeKey) {`);
        writer.writeLine(
          `          results.push({ ...log, model: "${model.name}", keyPath: validKeyPath, record: null, changelogId: log.id });`,
        );
        writer.writeLine(`          break;`);
        writer.writeLine(`        }`);
        writer.writeLine(`        const record = await prisma.${modelNameLower}.findUnique({`);
        writer.writeLine(`          where: ${generateWhereClause(pk.name, pkFields)},`);
        writer.writeLine(`          select: { ${selectFields} },`);
        writer.writeLine(`        });`);
      } else {
        // For non-root models, use findFirst with a flat where clause combining pk and scope
        const flatWhere = buildFlatWhereClause(pk.name, pkFields, authPath, rootModel);
        writer.writeLine(`        const record = await prisma.${modelNameLower}.findFirst({`);
        writer.writeLine(`          where: ${flatWhere},`);
        writer.writeLine(`          select: { ${selectFields} },`);
        writer.writeLine(`        });`);
      }

      writer.writeLine(
        `        results.push({ ...log, model: "${model.name}", keyPath: validKeyPath, record, changelogId: log.id });`,
      );
      writer.writeLine(`        break;`);
      writer.writeLine(`      }`);
    });
    writer.writeLine(`    }`);
    writer.writeLine(`}`);
    writer.writeLine(`return results;`);
  });
  writer.blankLine();

  // Generate sync handler functions for each model
  models.forEach((model) => {
    generateModelSyncHandler(writer, model, models, rootModel, dag);
  });
}

function generateModelSwitchCase(writer: CodeBlockWriter, model: Model) {
  writer.writeLine(`      case "${model.name}": {`);
  writer.block(() => {
    writer.writeLine(`const validation = validators.${model.name}.safeParse(event.payload);`);
    writer.writeLine(
      `if (!validation.success) throw new PermanentSyncError("${pushErrorTypes.RECORD_VALIDATION_FAILURE}", \`Validation failed for model ${model.name}: \${validation.error.message}\`);`,
    );
    writer.blankLine();
    writer.writeLine(`if (customValidation) {`);
    writer.writeLine(`  try {`);
    writer.writeLine(`    const validatedEvent = {`);
    writer.writeLine(`      ...event,`);
    writer.writeLine(`      payload: validation.data,`);
    writer.writeLine(`    } as EventsFor<typeof validators>;`);
    writer.writeLine(`    const { errorMessage } = await Promise.resolve(customValidation(validatedEvent));`);
    writer.writeLine(`    if (errorMessage) throw new PermanentSyncError("CUSTOM_VALIDATION_FAILED", errorMessage);`);
    writer.writeLine(`  } catch (error) {`);
    writer.writeLine(`    if (error instanceof PermanentSyncError) throw error;`);
    writer.writeLine(`    throw new PermanentSyncError(`);
    writer.writeLine(`      "CUSTOM_VALIDATION_FAILED",`);
    writer.writeLine(`      error instanceof Error ? error.message : "Unknown error in custom validation"`);
    writer.writeLine(`    );`);
    writer.writeLine(`  }`);
    writer.writeLine(`}`);
    writer.blankLine();
    writer.writeLine(`result = await sync${model.name}(event, validation.data, resolvedScopeKey, prisma);`);
    writer.writeLine(`break;`);
  });
  writer.writeLine(`      }`);
}

function generateModelSyncHandler(
  writer: CodeBlockWriter,
  model: Model,
  allModels: readonly Model[],
  rootModel: Model,
  dag: Record<string, Set<string>>,
) {
  const modelNameLower = model.name.charAt(0).toLowerCase() + model.name.slice(1);
  const pk = getUniqueIdentifiers(model)[0];
  const pkFields = JSON.parse(pk.keyPath) as string[];
  const authPath = buildAuthorizationPath(model.name, rootModel.name, allModels, dag);
  const isRootModel = model.name === rootModel.name;

  writer.writeLine(
    `async function sync${model.name}(event: OutboxEventRecord, data: z.infer<typeof validators.${model.name}>, scopeKey: string, prisma: PrismaClient): Promise<PushResult>`,
  );
  writer.block(() => {
    writer.writeLine(`const { id, operation } = event;`);
    if (pkFields.length === 1) {
      writer.writeLine(`const keyPath = [data.${pkFields[0]}];`);
    } else {
      writer.writeLine(`const keyPath = [${pkFields.map((f) => `data.${f}`).join(", ")}];`);
    }
    writer.writeLine(`const keyPathValidation = keyPathValidators.${model.name}.safeParse(keyPath);`);
    writer.writeLine(`if (!keyPathValidation.success) {`);
    writer.writeLine(
      `  throw new PermanentSyncError("${pushErrorTypes.KEYPATH_VALIDATION_FAILURE}", "Invalid keyPath for ${model.name}");`,
    );
    writer.writeLine(`}`);
    writer.blankLine();
    writer.writeLine(`const validKeyPath = keyPathValidation.data;`);
    writer.blankLine();

    writer.writeLine(`switch (operation) {`);

    // CREATE
    writer.writeLine(`  case "create": {`);
    writer.writeLine(`    const result = await prisma.$transaction(async (tx) => {`);

    // Move parent ownership check INSIDE the transaction
    if (!isRootModel && authPath.length > 0) {
      // For CREATE, we verify the parent model exists and is owned by scope
      const firstRelationFieldName = authPath[0];
      const relationField = model.fields.find((f) => f.name === firstRelationFieldName);

      if (!relationField) {
        throw new Error(`Failed to find relation field ${firstRelationFieldName} on model ${model.name}`);
      }

      if (!relationField.relationFromFields || relationField.relationFromFields.length === 0) {
        throw new Error(
          `Relation field ${firstRelationFieldName} on model ${model.name} does not have foreign key fields`,
        );
      }

      const foreignKeyFields = relationField.relationFromFields;
      const parentModel = allModels.find((m) => m.name === relationField.type);

      if (!parentModel || foreignKeyFields.length === 0) {
        throw new Error(`Failed to find parent model for ${model.name} via relation field ${firstRelationFieldName}`);
      }

      // Build the parent lookup with path to root
      const parentModelLower = parentModel.name.charAt(0).toLowerCase() + parentModel.name.slice(1);
      const remainingPath = authPath.slice(1);

      if (remainingPath.length > 0) {
        // Parent is not root, need to trace to root
        const parentSelectObj = buildSelectObject(remainingPath, rootModel);
        writer.writeLine(`      const parentRecord = await tx.${parentModelLower}.findUnique({`);

        // Build where clause for parent lookup
        const parentPk = getUniqueIdentifiers(parentModel)[0];
        const parentPkFields = JSON.parse(parentPk.keyPath) as string[];
        if (parentPkFields.length === 1) {
          writer.writeLine(`        where: { ${parentPkFields[0]}: data.${foreignKeyFields[0]} },`);
        } else {
          const compositeKey = parentPkFields.map((field, i) => `${field}: data.${foreignKeyFields[i]}`).join(", ");
          writer.writeLine(`        where: { ${parentPk.name}: { ${compositeKey} } },`);
        }
        writer.writeLine(`        select: ${parentSelectObj},`);
        writer.writeLine(`      });`);
        writer.blankLine();

        const accessChain = buildAccessChain(remainingPath);
        const rootPkFieldName = getUniqueIdentifiers(rootModel)[0].name;
        writer.writeLine(`      if (!parentRecord || parentRecord${accessChain}.${rootPkFieldName} !== scopeKey) {`);
        writer.writeLine(
          `        throw new PermanentSyncError("${pushErrorTypes.SCOPE_VIOLATION}", \`Unauthorized: ${model.name} parent is not owned by authenticated scope\`);`,
        );
        writer.writeLine(`      }`);
      } else {
        // Parent is the root model
        writer.writeLine(`      const parentRecord = await tx.${parentModelLower}.findUnique({`);

        const parentPk = getUniqueIdentifiers(parentModel)[0];
        const parentPkFields = JSON.parse(parentPk.keyPath) as string[];
        if (parentPkFields.length === 1) {
          writer.writeLine(`        where: { ${parentPkFields[0]}: data.${foreignKeyFields[0]} },`);
        } else {
          const compositeKey = parentPkFields.map((field, i) => `${field}: data.${foreignKeyFields[i]}`).join(", ");
          writer.writeLine(`        where: { ${parentPk.name}: { ${compositeKey} } },`);
        }
        writer.writeLine(`        select: { ${getUniqueIdentifiers(parentModel)[0].name}: true },`);
        writer.writeLine(`      });`);
        writer.blankLine();

        const parentPkFieldName = getUniqueIdentifiers(parentModel)[0].name;
        writer.writeLine(`      if (!parentRecord || parentRecord.${parentPkFieldName} !== scopeKey) {`);
        writer.writeLine(
          `        throw new PermanentSyncError("${pushErrorTypes.SCOPE_VIOLATION}", \`Unauthorized: ${model.name} parent is not owned by authenticated scope\`);`,
        );
        writer.writeLine(`      }`);
      }
      writer.blankLine();
    } else if (isRootModel) {
      writer.writeLine(`      if (scopeKey !== data.${getUniqueIdentifiers(model)[0].name}) {`);
      writer.writeLine(
        `        throw new PermanentSyncError("${pushErrorTypes.SCOPE_VIOLATION}", \`Unauthorized: root model pk must match authenticated scope\`);`,
      );
      writer.writeLine(`      }`);
      writer.blankLine();
    }

    writer.writeLine(`      let appliedChangelogId: string;`);
    writer.writeLine(`      const existingLog = await tx.changeLog.findUnique({`);
    writer.writeLine(`        where: { outboxEventId: event.id },`);
    writer.writeLine(`      });`);
    writer.blankLine();
    writer.writeLine(`      if (existingLog) {`);
    writer.writeLine(`        appliedChangelogId = existingLog.id;`);
    writer.writeLine(`      } else {`);
    writer.writeLine(`        const newLog = await tx.changeLog.create({`);
    writer.writeLine(`          data: {`);
    writer.writeLine(`            model: "${model.name}",`);
    writer.writeLine(`            keyPath: validKeyPath,`);
    writer.writeLine(`            operation: "create",`);
    writer.writeLine(`            scopeKey,`);
    writer.writeLine(`            outboxEventId: event.id,`);
    writer.writeLine(`          },`);
    writer.writeLine(`        });`);
    writer.writeLine(`        appliedChangelogId = newLog.id;`);
    writer.writeLine(`      }`);
    writer.writeLine(`      await tx.${modelNameLower}.create({ data });`);
    writer.writeLine(`      return { id, error: null, appliedChangelogId };`);
    writer.writeLine(`    });`);
    writer.writeLine(`    return result;`);
    writer.writeLine(`  }`);
    writer.blankLine();

    // UPDATE
    writer.writeLine(`  case "update": {`);
    writer.writeLine(`    const result = await prisma.$transaction(async (tx) => {`);

    // UPDATE: Check if record exists to determine normal update vs resurrection
    if (isRootModel) {
      writer.writeLine(`      // For root model, ownership is determined by pk matching scopeKey`);
      writer.writeLine(`      if (validKeyPath[0] !== scopeKey) {`);
      writer.writeLine(
        `        throw new PermanentSyncError("${pushErrorTypes.SCOPE_VIOLATION}", \`Unauthorized: ${model.name} pk does not match authenticated scope\`);`,
      );
      writer.writeLine(`      }`);
    } else {
      // For non-root models: lookup record, branch on existence
      const selectObj = buildSelectObject(authPath, rootModel);
      if (pkFields.length === 1) {
        writer.writeLine(`      const record = await tx.${modelNameLower}.findUnique({`);
        writer.writeLine(`        where: { ${pkFields[0]}: validKeyPath[0] },`);
        writer.writeLine(`        select: ${selectObj},`);
        writer.writeLine(`      });`);
      } else {
        const compositeKey = pkFields.map((field, i) => `${field}: validKeyPath[${i}]`).join(", ");
        writer.writeLine(`      const record = await tx.${modelNameLower}.findUnique({`);
        writer.writeLine(`        where: { ${pk.name}: { ${compositeKey} } },`);
        writer.writeLine(`        select: ${selectObj},`);
        writer.writeLine(`      });`);
      }
      writer.blankLine();

      // Case A: Record exists (normal update)
      writer.writeLine(`      if (record) {`);
      writer.writeLine(`        // Case A: Record exists - verify ownership from DB`);
      const accessChain = buildAccessChain(authPath);
      const rootPkFieldName = getUniqueIdentifiers(rootModel)[0].name;
      writer.writeLine(`        if (record${accessChain}.${rootPkFieldName} !== scopeKey) {`);
      writer.writeLine(
        `          throw new PermanentSyncError("${pushErrorTypes.SCOPE_VIOLATION}", \`Unauthorized: ${model.name} is not owned by the authenticated scope\`);`,
      );
      writer.writeLine(`        }`);

      // Validate new parent ownership only if record exists
      if (authPath.length > 0) {
        const firstRelationFieldName = authPath[0];
        const relationField = model.fields.find((f) => f.name === firstRelationFieldName);

        if (relationField && relationField.relationFromFields && relationField.relationFromFields.length > 0) {
          const foreignKeyFields = relationField.relationFromFields;
          const parentModel = allModels.find((m) => m.name === relationField.type);

          if (parentModel) {
            const parentModelLower = parentModel.name.charAt(0).toLowerCase() + parentModel.name.slice(1);
            const remainingPath = authPath.slice(1);

            if (remainingPath.length > 0) {
              const parentSelectObj = buildSelectObject(remainingPath, rootModel);
              const parentPk = getUniqueIdentifiers(parentModel)[0];
              const parentPkFields = JSON.parse(parentPk.keyPath) as string[];

              writer.writeLine(`        const newParentRecord = await tx.${parentModelLower}.findUnique({`);
              if (parentPkFields.length === 1) {
                writer.writeLine(`          where: { ${parentPkFields[0]}: data.${foreignKeyFields[0]} },`);
              } else {
                const compositeKey = parentPkFields
                  .map((field, i) => `${field}: data.${foreignKeyFields[i]}`)
                  .join(", ");
                writer.writeLine(`          where: { ${parentPk.name}: { ${compositeKey} } },`);
              }
              writer.writeLine(`          select: ${parentSelectObj},`);
              writer.writeLine(`        });`);
              writer.blankLine();

              const accessChainRemaining = buildAccessChain(remainingPath);
              const rootPkFieldName2 = getUniqueIdentifiers(rootModel)[0].name;
              writer.writeLine(
                `        if (!newParentRecord || newParentRecord${accessChainRemaining}.${rootPkFieldName2} !== scopeKey) {`,
              );
              writer.writeLine(
                `          throw new PermanentSyncError("${pushErrorTypes.SCOPE_VIOLATION}", \`Cannot reassign ${model.name} to parent outside scope\`);`,
              );
              writer.writeLine(`        }`);
            } else {
              writer.writeLine(`        if (data.${foreignKeyFields[0]} !== scopeKey) {`);
              writer.writeLine(
                `          throw new PermanentSyncError("${pushErrorTypes.SCOPE_VIOLATION}", \`Cannot reassign ${model.name} to different ${parentModel.name}\`);`,
              );
              writer.writeLine(`        }`);
            }
          }
        }
      }

      writer.writeLine(`      } else {`);
      writer.writeLine(`        // Case B: Record doesn't exist (resurrection) - verify ownership from payload`);

      // Case B: Record doesn't exist - validate ownership from payload (resurrection path)
      const firstRelationFieldName = authPath[0];
      const relationField = model.fields.find((f) => f.name === firstRelationFieldName);

      if (relationField && relationField.relationFromFields && relationField.relationFromFields.length > 0) {
        const foreignKeyFields = relationField.relationFromFields;
        const parentModel = allModels.find((m) => m.name === relationField.type);

        if (parentModel) {
          const parentModelLower = parentModel.name.charAt(0).toLowerCase() + parentModel.name.slice(1);
          const remainingPath = authPath.slice(1);

          if (remainingPath.length > 0) {
            const parentSelectObj = buildSelectObject(remainingPath, rootModel);
            const parentPk = getUniqueIdentifiers(parentModel)[0];
            const parentPkFields = JSON.parse(parentPk.keyPath) as string[];

            writer.writeLine(`        const parent = await tx.${parentModelLower}.findUnique({`);
            if (parentPkFields.length === 1) {
              writer.writeLine(`          where: { ${parentPkFields[0]}: data.${foreignKeyFields[0]} },`);
            } else {
              const compositeKey = parentPkFields.map((field, i) => `${field}: data.${foreignKeyFields[i]}`).join(", ");
              writer.writeLine(`          where: { ${parentPk.name}: { ${compositeKey} } },`);
            }
            writer.writeLine(`          select: ${parentSelectObj},`);
            writer.writeLine(`        });`);
            writer.blankLine();

            const accessChainRemaining = buildAccessChain(remainingPath);
            const rootPkFieldName2 = getUniqueIdentifiers(rootModel)[0].name;
            writer.writeLine(
              `        if (!parent || parent${accessChainRemaining}.${rootPkFieldName2} !== scopeKey) {`,
            );
            writer.writeLine(
              `          throw new PermanentSyncError("${pushErrorTypes.SCOPE_VIOLATION}", \`Cannot resurrect ${model.name} into unauthorized scope\`);`,
            );
            writer.writeLine(`        }`);
          } else {
            writer.writeLine(`        if (data.${foreignKeyFields[0]} !== scopeKey) {`);
            writer.writeLine(
              `          throw new PermanentSyncError("${pushErrorTypes.SCOPE_VIOLATION}", \`Cannot resurrect ${model.name} into different ${parentModel.name}\`);`,
            );
            writer.writeLine(`        }`);
          }
        }
      }
      writer.writeLine(`      }`);
    }
    writer.blankLine();

    writer.writeLine(`      let appliedChangelogId: string;`);
    writer.writeLine(`      const existingLog = await tx.changeLog.findUnique({`);
    writer.writeLine(`        where: { outboxEventId: event.id },`);
    writer.writeLine(`      });`);
    writer.blankLine();
    writer.writeLine(`      if (existingLog) {`);
    writer.writeLine(`        appliedChangelogId = existingLog.id;`);
    writer.writeLine(`      } else {`);
    writer.writeLine(`        const newLog = await tx.changeLog.create({`);
    writer.writeLine(`          data: {`);
    writer.writeLine(`            model: "${model.name}",`);
    writer.writeLine(`            keyPath: validKeyPath,`);
    writer.writeLine(`            operation: "update",`);
    writer.writeLine(`            scopeKey,`);
    writer.writeLine(`            outboxEventId: event.id,`);
    writer.writeLine(`          },`);
    writer.writeLine(`        });`);
    writer.writeLine(`        appliedChangelogId = newLog.id;`);
    writer.writeLine(`      }`);
    writer.writeLine(`      await tx.${modelNameLower}.upsert({`);
    writer.writeLine(`        where: ${generateWhereClause(pk.name, pkFields)},`);
    writer.writeLine(`        create: data,`);
    writer.writeLine(`        update: data,`);
    writer.writeLine(`      });`);

    writer.writeLine(`      return { id, error: null, appliedChangelogId };`);
    writer.writeLine(`    });`);
    writer.writeLine(`    return result;`);
    writer.writeLine(`  }`);
    writer.blankLine();

    // DELETE
    writer.writeLine(`  case "delete": {`);
    writer.writeLine(`    const result = await prisma.$transaction(async (tx) => {`);

    // Fix #5: Move verifyOwnership inside transaction
    if (isRootModel) {
      writer.writeLine(`      if (validKeyPath[0] !== scopeKey) {`);
      writer.writeLine(
        `        throw new PermanentSyncError("${pushErrorTypes.SCOPE_VIOLATION}", \`Unauthorized: ${model.name} pk does not match authenticated scope\`);`,
      );
      writer.writeLine(`      }`);
    } else {
      const selectObj = buildSelectObject(authPath, rootModel);
      if (pkFields.length === 1) {
        writer.writeLine(`      const record = await tx.${modelNameLower}.findUnique({`);
        writer.writeLine(`        where: { ${pkFields[0]}: validKeyPath[0] },`);
        writer.writeLine(`        select: ${selectObj},`);
        writer.writeLine(`      });`);
      } else {
        const compositeKey = pkFields.map((field, i) => `${field}: validKeyPath[${i}]`).join(", ");
        writer.writeLine(`      const record = await tx.${modelNameLower}.findUnique({`);
        writer.writeLine(`        where: { ${pk.name}: { ${compositeKey} } },`);
        writer.writeLine(`        select: ${selectObj},`);
        writer.writeLine(`      });`);
      }
      writer.blankLine();
      const accessChain = buildAccessChain(authPath);
      const rootPkFieldName = getUniqueIdentifiers(rootModel)[0].name;
      writer.writeLine(`      if (!record || record${accessChain}.${rootPkFieldName} !== scopeKey) {`);
      writer.writeLine(
        `        throw new PermanentSyncError("${pushErrorTypes.SCOPE_VIOLATION}", \`Unauthorized: ${model.name} is not owned by the authenticated scope\`);`,
      );
      writer.writeLine(`      }`);
    }
    writer.blankLine();

    writer.writeLine(`      let appliedChangelogId: string;`);
    writer.writeLine(`      const existingLog = await tx.changeLog.findUnique({`);
    writer.writeLine(`        where: { outboxEventId: event.id },`);
    writer.writeLine(`      });`);
    writer.blankLine();
    writer.writeLine(`      if (existingLog) {`);
    writer.writeLine(`        appliedChangelogId = existingLog.id;`);
    writer.writeLine(`      } else {`);
    writer.writeLine(`        const newLog = await tx.changeLog.create({`);
    writer.writeLine(`          data: {`);
    writer.writeLine(`            model: "${model.name}",`);
    writer.writeLine(`            keyPath: validKeyPath,`);
    writer.writeLine(`            operation: "delete",`);
    writer.writeLine(`            scopeKey,`);
    writer.writeLine(`            outboxEventId: event.id,`);
    writer.writeLine(`          },`);
    writer.writeLine(`        });`);
    writer.writeLine(`        appliedChangelogId = newLog.id;`);
    writer.writeLine(`      }`);
    writer.writeLine(`      await tx.${modelNameLower}.deleteMany({`);
    writer.writeLine(`        where: ${generateWhereClause(pk.name, pkFields)},`);
    writer.writeLine(`      });`);
    writer.writeLine(`      return { id, error: null, appliedChangelogId };`);
    writer.writeLine(`    });`);
    writer.writeLine(`    return result;`);
    writer.writeLine(`  }`);
    writer.blankLine();

    writer.writeLine(`  default:`);
    writer.writeLine(
      `    throw new PermanentSyncError("${pushErrorTypes.UNKNOWN_OPERATION}", \`Unknown operation: \${operation}\`);`,
    );
    writer.writeLine(`}`);
  });
  writer.blankLine();
}

/**
 * Build a flat where clause combining primary key fields and scope condition.
 * For a single pk field: { id: validKeyPath[0], board: { user: { id: scopeKey } } }
 * For composite pk: { id1: validKeyPath[0], id2: validKeyPath[1], board: { user: { id: scopeKey } } }
 */
function buildFlatWhereClause(pkName: string, pkFields: string[], authPath: string[], rootModel: Model): string {
  const whereWithScope = buildWhereWithScopeCondition(authPath, rootModel);

  if (pkFields.length === 1) {
    return `{ ${pkFields[0]}: validKeyPath[0], ${whereWithScope} }`;
  } else {
    const compositePkFields = pkFields.map((field, i) => `${field}: validKeyPath[${i}]`).join(", ");
    return `{ ${compositePkFields}, ${whereWithScope} }`;
  }
}

/**
 * Build a Prisma select object that traces through the auth path
 * For example: { board: { select: { user: { select: { id: true } } } } }
 */
function buildSelectObject(authPath: string[], rootModel: Model): string {
  if (authPath.length === 0) return "{}";

  // Get the root model's pk field name
  const rootPkFieldName = getUniqueIdentifiers(rootModel)[0].name;

  // Build nested select structure
  // For authPath ['user'] -> { user: { select: { id: true } } }
  // For authPath ['board', 'user'] -> { board: { select: { user: { select: { id: true } } } } }

  let result = "{ ";

  for (let i = 0; i < authPath.length; i++) {
    result += `${authPath[i]}: { select: { `;
  }

  // Add the root model's pk field
  result += `${rootPkFieldName}: true`;

  // Close all nested selects (one for each authPath element)
  for (let i = 0; i < authPath.length; i++) {
    result += " } }";
  }

  result += " }";

  return result;
}

/**
 * Build access chain for navigating through nested objects
 * For example: ['board', 'user'] -> '.board.user'
 */
function buildAccessChain(authPath: string[]): string {
  return "." + authPath.join(".");
}

/**
 * Build a where clause with nested scope condition for filtering by ownership.
 * For example, for authPath ['board', 'user']:
 * board: { user: { id: scopeKey } }
 */
function buildWhereWithScopeCondition(authPath: string[], rootModel: Model): string {
  if (authPath.length === 0) return "";

  const rootPkFieldName = getUniqueIdentifiers(rootModel)[0].name;
  let result = "";

  // Build nested where structure
  for (let i = 0; i < authPath.length; i++) {
    result += `${authPath[i]}: { `;
  }

  // Add the scopeKey condition at the deepest level
  result += `${rootPkFieldName}: scopeKey`;

  // Close all nested objects
  for (let i = 0; i < authPath.length; i++) {
    result += " }";
  }

  return result;
}

function generateWhereClause(pkName: string, pkFields: string[]): string {
  if (pkFields.length === 1) {
    return `{ ${pkFields[0]}: validKeyPath[0] }`;
  } else {
    const compositeKey = pkFields.map((field, i) => `${field}: validKeyPath[${i}]`).join(", ");
    return `{ ${pkName}: { ${compositeKey} } }`;
  }
}
