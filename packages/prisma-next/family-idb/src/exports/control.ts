import { IdbFamilyDescriptor } from "../core/control-descriptor";

export type { IdbControlFamilyInstance } from "../core/control-instance";
export type { IdbSchemaIR, IdbStoreIR, IdbIndexIR } from "../core/schema-ir";
export type { IdbContract } from "../core/validate";
export type { IdbManifest, IdbManifestMarker } from "../core/manifest";
export type { IdbManifestControlDriver } from "../core/manifest-driver";
export { IdbManifestControlDriverDescriptor, extractManifestDriver } from "../core/manifest-driver";

export default new IdbFamilyDescriptor();
