import type { Contract, ContractMarkerRecord } from "@prisma-next/contract/types";
import type { TargetBoundComponentDescriptor } from "@prisma-next/framework-components/components";
import type {
  ControlDriverInstance,
  ControlFamilyInstance,
  ControlStack,
  SignDatabaseResult,
  VerifyDatabaseResult,
  VerifyDatabaseSchemaResult,
} from "@prisma-next/framework-components/control";
import {
  VERIFY_CODE_HASH_MISMATCH,
  VERIFY_CODE_MARKER_MISSING,
  VERIFY_CODE_TARGET_MISMATCH,
} from "@prisma-next/framework-components/control";
import { emptyManifest, markerToRecord } from "./manifest";
import { extractManifestDriver } from "./manifest-driver";
import type { IdbSchemaIR, IdbStoreIR } from "./schema-ir";
import { verifyIdbSchema } from "./schema-verify";
import { validateContract } from "./validate";

// IDB only ever has a single "app" space (no multi-tenancy).
const APP_SPACE_ID = "app" as const;

// ── Schema derivation ─────────────────────────────────────────────────────────

function schemaFromContract(contract: ReturnType<typeof validateContract>): IdbSchemaIR {
  const contractStores = (
    contract.storage as {
      stores: Record<
        string,
        {
          keyPath: string;
          autoIncrement?: boolean;
          indexes?: Record<string, { keyPath: string; unique: boolean; multiEntry?: boolean }>;
        }
      >;
    }
  ).stores;

  const stores: Record<string, IdbStoreIR> = {};
  for (const [storeName, store] of Object.entries(contractStores)) {
    stores[storeName] = {
      keyPath: store.keyPath,
      ...(store.autoIncrement !== undefined ? { autoIncrement: store.autoIncrement } : {}),
      ...(store.indexes !== undefined && Object.keys(store.indexes).length > 0 ? { indexes: store.indexes } : {}),
    };
  }
  return { stores };
}

// ── exactOptionalPropertyTypes helpers ───────────────────────────────────────
// The framework uses exactOptionalPropertyTypes:true, so we must never assign
// `undefined` to a required-optional property. Use conditional spreads instead.

function contractInfo(storageHash: string, profileHash: string | undefined) {
  return profileHash !== undefined ? ({ storageHash, profileHash } as const) : ({ storageHash } as const);
}

function verifyMeta(contractPath: string, configPath: string | undefined) {
  return configPath !== undefined ? ({ contractPath, configPath } as const) : ({ contractPath } as const);
}

function signMeta(contractPath: string, configPath: string | undefined) {
  return configPath !== undefined ? ({ contractPath, configPath } as const) : ({ contractPath } as const);
}

/** Fully-typed IDB control family instance returned by {@link createIdbFamilyInstance}. */
export type IdbControlFamilyInstance = ControlFamilyInstance<"idb", IdbSchemaIR>;

/**
 * Creates an IDB control family instance for the given control stack.
 *
 * IDB is a browser-only API, so all CLI control-plane operations read/write a
 * manifest JSON file on disk instead of connecting to a live database.
 * The caller must provide an {@link IdbManifestControlDriver} as the `driver`
 * parameter — see {@link IdbManifestControlDriverDescriptor}.
 *
 * @param _stack - The assembled control stack (unused; IDB has no adapter/extension layer).
 */
export function createIdbFamilyInstance(_stack: ControlStack<"idb", string>): IdbControlFamilyInstance {
  return {
    familyId: "idb",

    // ── deserializeContract ────────────────────────────────────────────────

    deserializeContract(contractJson: unknown): Contract {
      return validateContract(contractJson) as Contract;
    },

    // ── verify ──────────────────────────────────────────────────────────────

    async verify(options: {
      readonly driver: ControlDriverInstance<"idb", string>;
      readonly contract: unknown;
      readonly expectedTargetId: string;
      readonly contractPath: string;
      readonly configPath?: string;
    }): Promise<VerifyDatabaseResult> {
      const start = Date.now();
      const mDriver = extractManifestDriver(options.driver);
      const contract = validateContract(options.contract);

      const storageHash = (contract.storage as { storageHash: string }).storageHash;
      const profileHash = (contract as { profileHash?: string }).profileHash;

      // Target ID check — IDB only supports the "idb" target.
      if (options.expectedTargetId !== "idb") {
        return {
          ok: false,
          code: VERIFY_CODE_TARGET_MISMATCH,
          summary: `Target mismatch: expected "idb", got "${options.expectedTargetId}"`,
          contract: contractInfo(storageHash, profileHash),
          target: { expected: options.expectedTargetId, actual: "idb" },
          meta: verifyMeta(options.contractPath, options.configPath),
          timings: { total: Date.now() - start },
        };
      }

      const manifest = await mDriver.readManifest();

      if (!manifest?.marker) {
        return {
          ok: false,
          code: VERIFY_CODE_MARKER_MISSING,
          summary: "Manifest marker is missing — run `prisma-next db sign` first",
          contract: contractInfo(storageHash, profileHash),
          target: { expected: "idb", actual: "idb" },
          meta: verifyMeta(options.contractPath, options.configPath),
          timings: { total: Date.now() - start },
        };
      }

      const markerHash = manifest.marker.storageHash;
      if (markerHash !== storageHash) {
        return {
          ok: false,
          code: VERIFY_CODE_HASH_MISMATCH,
          summary: `Storage hash mismatch: contract has "${storageHash}", manifest has "${markerHash}"`,
          contract: contractInfo(storageHash, profileHash),
          marker: { storageHash: markerHash, profileHash: manifest.marker.profileHash },
          target: { expected: "idb", actual: "idb" },
          meta: verifyMeta(options.contractPath, options.configPath),
          timings: { total: Date.now() - start },
        };
      }

      return {
        ok: true,
        summary: "Verification passed",
        contract: contractInfo(storageHash, profileHash),
        marker: { storageHash: markerHash, profileHash: manifest.marker.profileHash },
        target: { expected: "idb", actual: "idb" },
        meta: verifyMeta(options.contractPath, options.configPath),
        timings: { total: Date.now() - start },
      };
    },

    // ── verifySchema ───────────────────────────────────────────────────────

    verifySchema(options: {
      readonly contract: unknown;
      readonly schema: IdbSchemaIR;
      readonly strict: boolean;
      readonly frameworkComponents: ReadonlyArray<TargetBoundComponentDescriptor<"idb", string>>;
    }): VerifyDatabaseSchemaResult {
      const contract = validateContract(options.contract);
      return verifyIdbSchema(contract, options.schema, options.strict);
    },

    // ── sign ─────────────────────────────────────────────────────────────────

    async sign(options: {
      readonly driver: ControlDriverInstance<"idb", string>;
      readonly contract: unknown;
      readonly contractPath: string;
      readonly configPath?: string;
    }): Promise<SignDatabaseResult> {
      const start = Date.now();
      const mDriver = extractManifestDriver(options.driver);
      const contract = validateContract(options.contract);

      const storageHash = (contract.storage as { storageHash: string }).storageHash;
      const profileHash = (contract as { profileHash?: string }).profileHash ?? "";

      const existing = await mDriver.readManifest();
      const existingMarker = existing?.marker;

      // CAS: no-op when hashes match.
      if (existingMarker?.storageHash === storageHash && existingMarker?.profileHash === profileHash) {
        return {
          ok: true,
          summary: "Manifest marker is already up-to-date",
          contract: contractInfo(storageHash, profileHash),
          target: { expected: "idb", actual: "idb" },
          marker: { created: false, updated: false },
          meta: signMeta(options.contractPath, options.configPath),
          timings: { total: Date.now() - start },
        };
      }

      const newMarker = {
        storageHash,
        profileHash,
        updatedAt: new Date().toISOString(),
        invariants: [] as readonly string[],
        contractJson: null as unknown,
        canonicalVersion: null as number | null,
        appTag: null as string | null,
        meta: {} as Record<string, unknown>,
      };

      await mDriver.writeManifest({
        version: 1,
        ...(existing?.idbVersion !== undefined ? { idbVersion: existing.idbVersion } : {}),
        schema: schemaFromContract(contract),
        marker: newMarker,
      });

      const created = !existingMarker;
      const markerResult = existingMarker
        ? ({
            created: false,
            updated: true,
            previous: {
              storageHash: existingMarker.storageHash,
              profileHash: existingMarker.profileHash,
            },
          } as const)
        : ({ created: true, updated: false } as const);

      return {
        ok: true,
        summary: created ? "Manifest marker created" : "Manifest marker updated",
        contract: contractInfo(storageHash, profileHash),
        target: { expected: "idb", actual: "idb" },
        marker: markerResult,
        meta: signMeta(options.contractPath, options.configPath),
        timings: { total: Date.now() - start },
      };
    },

    // ── readMarker ─────────────────────────────────────────────────────────

    async readMarker(options: {
      readonly driver: ControlDriverInstance<"idb", string>;
      readonly space: string;
    }): Promise<ContractMarkerRecord | null> {
      if (options.space !== APP_SPACE_ID) {
        // IDB only has a single "app" space.
        return null;
      }
      const mDriver = extractManifestDriver(options.driver);
      const manifest = await mDriver.readManifest();
      if (!manifest?.marker) return null;
      return markerToRecord(manifest.marker);
    },

    // ── readAllMarkers ─────────────────────────────────────────────────────

    async readAllMarkers(options: {
      readonly driver: ControlDriverInstance<"idb", string>;
    }): Promise<ReadonlyMap<string, ContractMarkerRecord>> {
      const mDriver = extractManifestDriver(options.driver);
      const manifest = await mDriver.readManifest();
      if (!manifest?.marker) return new Map();
      return new Map([[APP_SPACE_ID, markerToRecord(manifest.marker)]]);
    },

    // ── introspect ─────────────────────────────────────────────────────────

    async introspect(options: {
      readonly driver: ControlDriverInstance<"idb", string>;
      readonly contract?: unknown;
    }): Promise<IdbSchemaIR> {
      const mDriver = extractManifestDriver(options.driver);
      const manifest = await mDriver.readManifest();
      return manifest?.schema ?? emptyManifest().schema;
    },
  };
}

export type { ControlDriverInstance, SignDatabaseResult, VerifyDatabaseResult, VerifyDatabaseSchemaResult };

export type { IdbSchemaIR } from "./schema-ir";
import { IdbManifestControlDriverDescriptor } from "./manifest-driver";
export { IdbManifestControlDriverDescriptor };
