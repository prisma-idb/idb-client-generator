import type { LogWithRecord } from "../server/batch-processor";
import { validators, keyPathValidators } from "../validators";
import type { PrismaIDBClient } from "./prisma-idb-client";

type ApplyPullProps = {
  idbClient: PrismaIDBClient;
  logsWithRecords: LogWithRecord<typeof validators>[];
  originId: string;
};

/**
 * Apply pulled changes from remote server to local IndexedDB.
 *
 * All operations are wrapped in a single transaction to ensure atomicity and prevent
 * AbortError from concurrent transaction conflicts. This guarantees that either all
 * changes are applied successfully or the entire batch is rolled back.
 *
 * Logs with the same originId are filtered out to prevent echo of pushed events
 * being reapplied as pulled events.
 *
 * @param props - Configuration object
 * @param props.idbClient - The PrismaIDB client instance
 * @param props.logsWithRecords - Array of change logs with validated records from server
 * @param props.originId - Origin ID to filter out echoed events
 * @returns Object with sync statistics including applied records, missing records, and validation errors
 */
export async function applyPull(props: ApplyPullProps) {
  const { idbClient, logsWithRecords, originId } = props;

  let missingRecords = 0;
  const validationErrors: { model: string; error: unknown }[] = [];

  // Wrap all operations in a single transaction to prevent AbortError and ensure atomicity
  const tx = idbClient._db.transaction(["Board", "Todo", "User", "OutboxEvent"], "readwrite");

  let txAborted = false;

  // Track transaction abort to handle it separately from operation errors
  tx.addEventListener("abort", () => {
    txAborted = true;
  });

  try {
    for (const change of logsWithRecords) {
      // Ignore logs with the same originId to prevent echo of pushed events
      if (change.originId === originId) {
        continue;
      }

      const { model, operation, record, keyPath } = change;
      if (!record && operation !== "delete") {
        missingRecords++;
        continue;
      }

      // Exit early if transaction was aborted during previous operations
      if (txAborted) {
        validationErrors.push({ model, error: new Error("Transaction was aborted") });
        continue;
      }

      try {
        if (model === "Board") {
          if (operation === "delete") {
            const validatedKeyPath = keyPathValidators.Board.parse(keyPath);
            await idbClient.board.delete(
              { where: { id: validatedKeyPath[0] } },
              { silent: true, addToOutbox: false, tx }
            );
          } else {
            const validatedRecord = validators.Board.parse(record);
            if (operation === "create") {
              await idbClient.board.create({ data: validatedRecord }, { silent: true, addToOutbox: false, tx });
            } else if (operation === "update") {
              await idbClient.board.update(
                { where: { id: validatedRecord.id }, data: validatedRecord },
                { silent: true, addToOutbox: false, tx }
              );
            } else {
              console.warn("Unknown operation for Board:", operation);
            }
          }
        } else if (model === "Todo") {
          if (operation === "delete") {
            const validatedKeyPath = keyPathValidators.Todo.parse(keyPath);
            await idbClient.todo.delete(
              { where: { id: validatedKeyPath[0] } },
              { silent: true, addToOutbox: false, tx }
            );
          } else {
            const validatedRecord = validators.Todo.parse(record);
            if (operation === "create") {
              await idbClient.todo.create({ data: validatedRecord }, { silent: true, addToOutbox: false, tx });
            } else if (operation === "update") {
              await idbClient.todo.update(
                { where: { id: validatedRecord.id }, data: validatedRecord },
                { silent: true, addToOutbox: false, tx }
              );
            } else {
              console.warn("Unknown operation for Todo:", operation);
            }
          }
        } else if (model === "User") {
          if (operation === "delete") {
            const validatedKeyPath = keyPathValidators.User.parse(keyPath);
            await idbClient.user.delete(
              { where: { id: validatedKeyPath[0] } },
              { silent: true, addToOutbox: false, tx }
            );
          } else {
            const validatedRecord = validators.User.parse(record);
            if (operation === "create") {
              await idbClient.user.create({ data: validatedRecord }, { silent: true, addToOutbox: false, tx });
            } else if (operation === "update") {
              await idbClient.user.update(
                { where: { id: validatedRecord.id }, data: validatedRecord },
                { silent: true, addToOutbox: false, tx }
              );
            } else {
              console.warn("Unknown operation for User:", operation);
            }
          }
        }
      } catch (error) {
        validationErrors.push({ model, error });
        continue;
      }
    }

    // Wait for all pending operations in the transaction to complete
    await tx.done;
  } catch (error) {
    // Handle transaction abort error separately
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("Transaction aborted during pull apply:", error.message);
      // Return partial results - records that failed go to validationErrors
    } else {
      throw error;
    }
  }

  return {
    missingRecords,
    totalAppliedRecords: logsWithRecords.length - missingRecords - validationErrors.length,
    validationErrors,
  };
}
