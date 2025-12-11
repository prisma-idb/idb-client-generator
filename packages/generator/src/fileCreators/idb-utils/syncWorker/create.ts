import { SourceFile } from "ts-morph";

/**
 * Re-exports sync worker types from idb-interface for convenience.
 * The actual createSyncWorker method is on the PrismaIDBClient.
 */
export function addSyncWorkerCode(idbUtilsFile: SourceFile) {
  // Re-export the types from idb-interface so they're available in utils as well
  idbUtilsFile.addExportDeclaration({
    moduleSpecifier: "./idb-interface",
    namedExports: ["AppliedResult", "SyncWorkerOptions", "SyncWorker"],
    isTypeOnly: true,
  });
}
