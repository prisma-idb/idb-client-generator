import { readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { ContractMarkerRecord } from "@prisma-next/contract/types";
import type { IdbSchemaIR } from "./schema-ir";

// ── Manifest marker ───────────────────────────────────────────────────────────

/**
 * The persisted form of a contract marker as stored inside the manifest JSON.
 *
 * All fields that are native `Date` in `ContractMarkerRecord` are stored as
 * ISO strings and converted back on read.
 */
export type IdbManifestMarker = {
  readonly storageHash: string;
  readonly profileHash: string;
  readonly updatedAt: string; // ISO-8601 string (Date on ContractMarkerRecord)
  readonly invariants: readonly string[];
  readonly contractJson: unknown | null;
  readonly canonicalVersion: number | null;
  readonly appTag: string | null;
  readonly meta: Record<string, unknown>;
};

// ── Manifest ─────────────────────────────────────────────────────────────────

/** Top-level shape of the `prisma-idb.manifest.json` file on disk. */
export type IdbManifest = {
  readonly version: 1;
  /** Monotone integer version counter for IndexedDB DDL (see ADR 001). */
  readonly idbVersion?: number;
  readonly schema: IdbSchemaIR;
  readonly marker?: IdbManifestMarker;
};

/** An empty manifest with no schema and no marker. */
export function emptyManifest(): IdbManifest {
  return { version: 1, schema: { stores: {} } };
}

// ── Conversion: marker ↔ ContractMarkerRecord ─────────────────────────────────

/** Convert an {@link IdbManifestMarker} to a {@link ContractMarkerRecord}. */
export function markerToRecord(m: IdbManifestMarker): ContractMarkerRecord {
  return {
    storageHash: m.storageHash,
    profileHash: m.profileHash,
    updatedAt: new Date(m.updatedAt),
    invariants: m.invariants,
    contractJson: m.contractJson,
    canonicalVersion: m.canonicalVersion,
    appTag: m.appTag,
    meta: m.meta,
  };
}

/** Convert a {@link ContractMarkerRecord} to an {@link IdbManifestMarker}. */
export function recordToMarker(r: ContractMarkerRecord): IdbManifestMarker {
  return {
    storageHash: r.storageHash,
    profileHash: r.profileHash,
    updatedAt: (r.updatedAt ?? new Date()).toISOString(),
    invariants: r.invariants ?? [],
    contractJson: r.contractJson ?? null,
    canonicalVersion: r.canonicalVersion ?? null,
    appTag: r.appTag ?? null,
    meta: r.meta ?? {},
  };
}

// ── Disk I/O ──────────────────────────────────────────────────────────────────

/**
 * Reads and parses the manifest file at `manifestPath`.
 *
 * Returns `null` when the file does not exist (fresh project).
 * Throws on malformed JSON or version mismatch.
 */
export async function readManifest(manifestPath: string): Promise<IdbManifest | null> {
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf-8");
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") return null;
    throw err;
  }

  const parsed: unknown = JSON.parse(raw);
  if (!isValidManifest(parsed)) {
    throw new Error(
      `IDB manifest at "${manifestPath}" is invalid or has an unsupported version. ` +
        `Delete the file and re-run \`prisma-next db sign\` to regenerate it.`
    );
  }

  return parsed;
}

/**
 * Writes the manifest to disk atomically (write to a temp file then rename).
 *
 * Atomic rename prevents partial writes from corrupting the manifest if the
 * process is killed mid-write.
 */
export async function writeManifest(manifestPath: string, manifest: IdbManifest): Promise<void> {
  const json = JSON.stringify(manifest, null, 2);
  const tmp = join(tmpdir(), `prisma-idb-manifest-${basename(manifestPath)}-${Date.now()}.tmp`);
  await writeFile(tmp, json, "utf-8");
  // rename is atomic on POSIX when src and dst are on the same filesystem.
  // On Windows (cross-device) it falls back gracefully to copy+unlink.
  try {
    await rename(tmp, manifestPath);
  } catch (err: unknown) {
    // Cross-device rename on Windows: fall back to overwrite.
    if (isNodeError(err) && err.code === "EXDEV") {
      await writeFile(manifestPath, json, "utf-8");
    } else {
      throw err;
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

function isValidManifest(value: unknown): value is IdbManifest {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>)["version"] === 1 &&
    typeof (value as Record<string, unknown>)["schema"] === "object"
  );
}
