import CodeBlockWriter from "code-block-writer";
import { Model } from "../types";
import { getUniqueIdentifiers } from "../../helpers/utils";

export function createApplyPullFile(writer: CodeBlockWriter, models: Model[]) {
  // Write imports
  writer.writeLine(`import type { LogWithRecord } from '../server/batch-processor';`);
  writer.writeLine(`import { validators } from '../validators';`);
  writer.writeLine(`import type { PrismaIDBClient } from './prisma-idb-client';`);
  writer.blankLine();

  // Write type definition for applyPull props
  writer.writeLine(`type ApplyPullProps = {`);
  writer.writeLine(`	idbClient: PrismaIDBClient;`);
  writer.writeLine(`	logsWithRecords: LogWithRecord<typeof validators>[];`);
  writer.writeLine(`	originId: string;`);
  writer.writeLine(`};`);
  writer.blankLine();

  // Write JSDoc for the applyPull function
  writer.writeLine(`/**`);
  writer.writeLine(` * Apply pulled changes from remote server to local IndexedDB.`);
  writer.writeLine(` * `);
  writer.writeLine(` * All operations are wrapped in a single transaction to ensure atomicity and prevent`);
  writer.writeLine(` * AbortError from concurrent transaction conflicts. This guarantees that either all`);
  writer.writeLine(` * changes are applied successfully or the entire batch is rolled back.`);
  writer.writeLine(` * `);
  writer.writeLine(` * Logs with the same originId are filtered out to prevent echo of pushed events`);
  writer.writeLine(` * being reapplied as pulled events.`);
  writer.writeLine(` * `);
  writer.writeLine(` * @param props - Configuration object`);
  writer.writeLine(` * @param props.idbClient - The PrismaIDB client instance`);
  writer.writeLine(` * @param props.logsWithRecords - Array of change logs with validated records from server`);
  writer.writeLine(` * @param props.originId - Origin ID to filter out echoed events`);
  writer.writeLine(` * @returns Object with sync statistics including applied records, missing records, and validation errors`);
  writer.writeLine(` */`);

  // Write applyPull function
  writer.writeLine(`export async function applyPull(props: ApplyPullProps) `).block(() => {
    writer.writeLine(`const { idbClient, logsWithRecords, originId } = props;`);
    writer.blankLine();

    writer.writeLine(`let missingRecords = 0;`);
    writer.writeLine(`const validationErrors: { model: string; error: unknown }[] = [];`);
    writer.blankLine();

    // Create a single shared transaction for all operations
    writer.writeLine(`// Wrap all operations in a single transaction to prevent AbortError and ensure atomicity`);
    const storeNames = models.map((m) => `'${m.name}'`).concat(`'OutboxEvent'`).join(", ");
    writer.writeLine(`const tx = idbClient._db.transaction([${storeNames}], 'readwrite');`);
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
        writer.writeLine(`// Ignore logs with the same originId to prevent echo of pushed events`);
        writer.writeLine(`if (change.originId === originId) {`);
        writer.writeLine(`  continue;`);
        writer.writeLine(`}`);
        writer.blankLine();
        writer.writeLine(`const { model, operation, record } = change;`);
        writer.writeLine(`if (!record)`).block(() => {
          writer.writeLine(`missingRecords++;`);
          writer.writeLine(`continue;`);
        });
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

            // Build where clause for update/delete
            const whereClause =
              pk.length === 1
                ? `{ ${pk[0]}: validatedRecord.${pk[0]} }`
                : `{ ${pk.join("_")}: { ${pk.map((field) => `${field}: validatedRecord.${field}`).join(", ")} } }`;

            const condition = index === 0 ? "if" : "else if";

            writer.writeLine(`${condition} (model === '${modelName}') `).block(() => {
              writer.writeLine(`const validatedRecord = validators.${modelName}.parse(record);`);
              writer.writeLine(`if (operation === 'create') `).block(() => {
                writer.writeLine(
                  `await idbClient.${camelCaseName}.create({ data: validatedRecord }, { silent: true, addToOutbox: false, tx });`,
                );
              });
              writer.writeLine(`else if (operation === 'update') `).block(() => {
                writer.writeLine(
                  `await idbClient.${camelCaseName}.update({ where: ${whereClause}, data: validatedRecord }, { silent: true, addToOutbox: false, tx });`,
                );
              });
              writer.writeLine(`else if (operation === 'delete') `).block(() => {
                writer.writeLine(
                  `await idbClient.${camelCaseName}.delete({ where: ${whereClause} }, { silent: true, addToOutbox: false, tx });`,
                );
              });
              writer.writeLine(`else `).block(() => {
                writer.writeLine(`console.warn('Unknown operation for ${modelName}:', operation);`);
              });
            });
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
      writer.writeLine(`// Handle transaction abort error separately`);
      writer.writeLine(`if (error instanceof Error && error.name === 'AbortError') {`);
      writer.writeLine(`  console.warn('Transaction aborted during pull apply:', error.message);`);
      writer.writeLine(`  // Return partial results - records that failed go to validationErrors`);
      writer.writeLine(`} else {`);
      writer.writeLine(`  throw error;`);
      writer.writeLine(`}`);
    });

    writer.blankLine();
    writer.writeLine(
      `return { missingRecords, totalAppliedRecords: logsWithRecords.length - missingRecords - validationErrors.length, validationErrors };`,
    );
  });
}
