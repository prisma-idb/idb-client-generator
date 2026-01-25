import CodeBlockWriter from "code-block-writer";

/**
 * Re-exports sync worker types from idb-interface for convenience.
 * The actual createSyncWorker method is on the PrismaIDBClient.
 */
export function addSyncWorkerCode(writer: CodeBlockWriter) {
  // Re-export the types from idb-interface so they're available in utils as well
  writer.writeLine(`export type { SyncWorkerOptions, SyncWorker } from "./idb-interface";`);
}
