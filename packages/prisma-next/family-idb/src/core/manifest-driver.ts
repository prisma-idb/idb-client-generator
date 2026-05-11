import type { ControlDriverInstance } from "@prisma-next/framework-components/control";
import { readManifest, writeManifest, type IdbManifest } from "./manifest";

// ── Driver class ──────────────────────────────────────────────────────────────

/**
 * `ControlDriverInstance` implementation for IndexedDB.
 *
 * Unlike SQL-based drivers, IDB has no network connection to manage.
 * The "connection" is a path to the manifest JSON file that persists the
 * last-known schema and contract marker between CLI runs.
 *
 * `query()` is a no-op (IDB queries happen at runtime, not via SQL). `close()`
 * is similarly a no-op — no handles to release.
 */
export class IdbManifestControlDriver implements ControlDriverInstance<"idb", "idb"> {
  readonly familyId = "idb" as const;
  readonly targetId = "idb" as const;

  readonly #manifestPath: string;

  constructor(manifestPath: string) {
    this.#manifestPath = manifestPath;
  }

  get manifestPath(): string {
    return this.#manifestPath;
  }

  /** No-op — IDB does not use SQL. */
  async query<Row = Record<string, unknown>>(
    _sql: string,
    _params?: readonly unknown[]
  ): Promise<{ readonly rows: Row[] }> {
    return { rows: [] };
  }

  /** No-op — IDB has no connection handle to release. */
  async close(): Promise<void> {
    // intentionally empty
  }

  /** Reads the manifest from disk, returning `null` if not yet created. */
  async readManifest(): Promise<IdbManifest | null> {
    return readManifest(this.#manifestPath);
  }

  /** Atomically writes the manifest to disk. */
  async writeManifest(manifest: IdbManifest): Promise<void> {
    return writeManifest(this.#manifestPath, manifest);
  }
}

// ── Descriptor ────────────────────────────────────────────────────────────────

/**
 * Creates an {@link IdbManifestControlDriver} from a manifest file path.
 *
 * Usage (in `prisma.config.ts`):
 * ```ts
 * import idbDriver from "@prisma-next-idb/family-idb/control";
 * // ...
 * driver: IdbManifestControlDriverDescriptor,
 * connection: "./prisma-idb.manifest.json",
 * ```
 */
export const IdbManifestControlDriverDescriptor = {
  kind: "driver" as const,
  id: "idb-manifest",
  version: "1.0.0",
  familyId: "idb" as const,
  targetId: "idb" as const,

  async create(connection: string): Promise<IdbManifestControlDriver> {
    return new IdbManifestControlDriver(connection);
  },
} satisfies import("@prisma-next/framework-components/control").ControlDriverDescriptor<
  "idb",
  "idb",
  IdbManifestControlDriver,
  string
>;

// ── Extractor ─────────────────────────────────────────────────────────────────

/**
 * Casts a {@link ControlDriverInstance} to {@link IdbManifestControlDriver},
 * throwing if the wrong driver type is provided.
 *
 * Mirrors the `extractDb()` helper used in the Mongo family.
 */
export function extractManifestDriver(driver: ControlDriverInstance<"idb", string>): IdbManifestControlDriver {
  if (!(driver instanceof IdbManifestControlDriver)) {
    throw new Error(
      "The provided driver is not an IdbManifestControlDriver. " +
        "Use IdbManifestControlDriverDescriptor.create(manifestPath) to create the driver."
    );
  }
  return driver;
}
