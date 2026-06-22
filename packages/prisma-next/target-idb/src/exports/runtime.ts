import type { RuntimeTargetDescriptor, RuntimeTargetInstance } from "@prisma-next/framework-components/execution";
import { idbTargetDescriptorMeta } from "../core/descriptor-meta";
export { idbCodecLookup } from "../core/codecs";

// ── Browser-safe DDL apply helpers ────────────────────────────────────────────
// These are re-exported here (in addition to the CLI-only `./migration` subpath)
// so browser-side code (e.g. auto-migrate.ts) can import them without pulling
// `MigrationCLI` → `node:fs` into the client bundle.
export { applyOneDdlOp, openAndUpgrade, readMarker, writeMarker } from "../core/apply-ddl-op";
export type { IdbMarkerRecord, MarkerWriteInput } from "../core/apply-ddl-op";
export { isIdbDdlOp } from "../core/migration-factories";
export type {
  IdbDdlOp,
  CreateObjectStoreOp,
  DropObjectStoreOp,
  CreateIndexOp,
  DropIndexOp,
} from "../core/migration-factories";

export type IdbRuntimeTargetInstance = RuntimeTargetInstance<"idb", "idb">;

const idbRuntimeTargetDescriptor: RuntimeTargetDescriptor<"idb", "idb", IdbRuntimeTargetInstance> = {
  ...idbTargetDescriptorMeta,
  create(): IdbRuntimeTargetInstance {
    return {
      familyId: "idb",
      targetId: "idb",
    };
  },
};

export default idbRuntimeTargetDescriptor;
