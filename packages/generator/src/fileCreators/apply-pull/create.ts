import CodeBlockWriter from "code-block-writer";
import { Model } from "../types";
import { getUniqueIdentifiers } from "../../helpers/utils";

export function createApplyPullFile(writer: CodeBlockWriter, models: Model[], versionMetaModelName: string) {
  // Write imports
  writer.writeLine(`import type { LogWithRecord } from '../server/batch-processor';`);
  writer.writeLine(`import { validators, keyPathValidators } from '../validators';`);
  writer.writeLine(`import type { PrismaIDBClient } from './prisma-idb-client';`);
  writer.blankLine();

  // Write type definition for applyPull props
  writer.writeLine(`type ApplyPullProps = {`);
  writer.writeLine(`	idbClient: PrismaIDBClient;`);
  writer.writeLine(`	logsWithRecords: LogWithRecord<typeof validators>[];`);
  writer.writeLine(`};`);
  writer.blankLine();

  // Write type definition for applyPull return value
  writer.writeLine(`export type ApplyPullResult =`);
  writer.block(() => {
    writer.writeLine(`validationErrors: { model: string; error: unknown }[];`);
    writer.writeLine(`missingRecords: number;`);
    writer.writeLine(`staleRecords: number;`);
    writer.writeLine(`totalAppliedRecords: number;`);
  });
  writer.blankLine();

  // Write JSDoc for the applyPull function
  writer.writeLine(`/**`);
  writer.writeLine(` * Apply pulled changes from remote server to local IndexedDB.`);
  writer.writeLine(` * `);
  writer.writeLine(` * All operations are wrapped in a single transaction to reduce conflicts; invalid`);
  writer.writeLine(` * records are skipped and reported in the return summary.`);
  writer.writeLine(` * `);
  writer.writeLine(` * @param props - Configuration object`);
  writer.writeLine(` * @param props.idbClient - The PrismaIDB client instance`);
  writer.writeLine(` * @param props.logsWithRecords - Array of change logs with validated records from server`);
  writer.writeLine(
    ` * @returns Object with sync statistics including applied records, missing records, and validation errors`
  );
  writer.writeLine(` */`);

  // Write applyPull function
  writer.writeLine(`export async function applyPull(props: ApplyPullProps): Promise<ApplyPullResult> `).block(() => {
    writer.writeLine(`const { idbClient, logsWithRecords } = props;`);
    writer.blankLine();

    writer.writeLine(`let staleRecords = 0;`);
    writer.writeLine(`let missingRecords = 0;`);
    writer.writeLine(`let totalAppliedRecords = 0;`);
    writer.writeLine(`const validationErrors: { model: string; error: unknown }[] = [];`);
    writer.blankLine();

    // Create a single shared transaction for all operations
    writer.writeLine(`// Wrap all operations in a single transaction to prevent AbortError and ensure atomicity`);
    const storeNames = models.map((m) => `'${m.name}'`).join(", ");
    writer.writeLine(`const tx = idbClient._db.transaction([${storeNames}, '${versionMetaModelName}'], 'readwrite');`);
    writer.blankLine();

    writer.writeLine(`let txAborted = false;`);
    writer.blankLine();

    writer.writeLine(`// Track transaction abort to handle it separately from operation errors`);
    writer.writeLine(`tx.addEventListener('abort', () => {`);
    writer.writeLine(`  txAborted = true;`);
    writer.writeLine(`});`);
    writer.blankLine();

    writer.writeLine(`try `).block(() => {
      writer.writeLine(`for (const change of logsWithRecords) `).block(() => {
        writer.writeLine(`const { model, operation, record, keyPath, changelogId } = change;`);
        writer.writeLine(`if (!record && operation !== 'delete')`).block(() => {
          writer.writeLine(`missingRecords++;`);
          writer.writeLine(`continue;`);
        });
        writer.blankLine();

        // Skip stale records
        writer.writeLine(`const versionMeta = await idbClient.$versionMeta.get(model, keyPath, tx);`);
        writer.writeLine(`const lastAppliedChangeId = versionMeta?.lastAppliedChangeId ?? null;`);
        writer.writeLine(`if (lastAppliedChangeId !== null && lastAppliedChangeId >= changelogId) {`);
        writer.writeLine(`  staleRecords++;`);
        writer.writeLine(`  continue;`);
        writer.writeLine(`}`);
        writer.blankLine();

        // Early exit if transaction was aborted
        writer.writeLine(`// Exit early if transaction was aborted during previous operations`);
        writer.writeLine(`if (txAborted)`).block(() => {
          writer.writeLine(`validationErrors.push({ model, error: new Error('Transaction was aborted') });`);
          writer.writeLine(`continue;`);
        });
        writer.blankLine();

        writer.writeLine(`try `).block(() => {
          models.forEach((model, index) => {
            const modelName = model.name;
            const camelCaseName = modelName.charAt(0).toLowerCase() + modelName.slice(1);
            const pk = JSON.parse(getUniqueIdentifiers(model)[0].keyPath) as string[];

            // Build where clause for update/delete using keypath field names and tuple indices
            const keyPathWhereClause =
              pk.length === 1
                ? `{ ${pk[0]}: validatedKeyPath[0] }`
                : `{ ${pk.join("_")}: { ${pk.map((field, i) => `${field}: validatedKeyPath[${i}]`).join(", ")} } }`;

            // Build where clause for full record (used in update)
            const fullRecordWhereClause =
              pk.length === 1
                ? `{ ${pk[0]}: validatedRecord.${pk[0]} }`
                : `{ ${pk.join("_")}: { ${pk.map((field) => `${field}: validatedRecord.${field}`).join(", ")} } }`;

            const condition = index === 0 ? "if" : "else if";

            writer.writeLine(`${condition} (model === '${modelName}') `).block(() => {
              writer.writeLine(`if (operation === 'delete') `).block(() => {
                writer.writeLine(`const validatedKeyPath = keyPathValidators.${modelName}.parse(keyPath);`);
                writer.writeLine(
                  `await idbClient.${camelCaseName}.deleteMany({ where: ${keyPathWhereClause} }, { silent: true, addToOutbox: false, tx });`
                );
                writer.writeLine(`totalAppliedRecords++;`);
                writer.writeLine(`// Mark as pulled with latest changelog ID`);
                writer.writeLine(`await idbClient.$versionMeta.markPulled(model, keyPath, changelogId, { tx });`);
              });
              writer.writeLine(`else `).block(() => {
                writer.writeLine(`const validatedRecord = validators.${modelName}.parse(record);`);
                writer.writeLine(`if (operation === 'create') `).block(() => {
                  writer.writeLine(
                    `await idbClient.${camelCaseName}.upsert({ create: validatedRecord, update: validatedRecord, where: ${fullRecordWhereClause} }, { silent: true, addToOutbox: false, tx });`
                  );
                  writer.writeLine(`totalAppliedRecords++;`);
                  writer.writeLine(`// Mark as pulled with latest changelog ID`);
                  writer.writeLine(`await idbClient.$versionMeta.markPulled(model, keyPath, changelogId, { tx });`);
                });
                writer.writeLine(`else if (operation === 'update') `).block(() => {
                  writer.writeLine(
                    `await idbClient.${camelCaseName}.upsert({ where: ${fullRecordWhereClause}, create: validatedRecord, update: validatedRecord }, { silent: true, addToOutbox: false, tx });`
                  );
                  writer.writeLine(`totalAppliedRecords++;`);
                  writer.writeLine(`// Mark as pulled with latest changelog ID`);
                  writer.writeLine(`await idbClient.$versionMeta.markPulled(model, keyPath, changelogId, { tx });`);
                });
                writer.writeLine(`else `).block(() => {
                  writer.writeLine(
                    `throw new Error(\`Unknown operation for ${modelName}: \${operation} (keyPath: \${JSON.stringify(keyPath)})\`);`
                  );
                });
              });
            });
          });

          writer.writeLine(`else `).block(() => {
            writer.writeLine(
              `throw new Error(\`Unknown model: \${model} (operation: \${operation}, keyPath: \${JSON.stringify(keyPath)})\`);`
            );
          });
        });
        writer.writeLine(`catch (error) `).block(() => {
          writer.writeLine(`validationErrors.push({ model, error });`);
          writer.writeLine(`continue;`);
        });
      });
      writer.blankLine();

      // Wait for the transaction to complete
      writer.writeLine(`// Wait for all pending operations in the transaction to complete`);
      writer.writeLine(`await tx.done;`);
    });
    writer.writeLine(`catch (error) `).block(() => {
      writer.writeLine(`// Handle transaction abort error by rethrowing`);
      writer.writeLine(`if (error instanceof Error && error.name === 'AbortError') {`);
      writer.writeLine(`  console.warn('Transaction aborted during pull apply:', error.message);`);
      writer.writeLine(`}`);
      writer.writeLine(`throw error;`);
    });

    writer.blankLine();
    writer.write(`return `).block(() => {
      writer.writeLine(`validationErrors,`);
      writer.writeLine(`missingRecords,`);
      writer.writeLine(`staleRecords,`);
      writer.writeLine(`totalAppliedRecords,`);
    });
  });
}
