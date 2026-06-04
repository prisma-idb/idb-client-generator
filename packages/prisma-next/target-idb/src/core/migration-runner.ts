import type {
  ControlDriverInstance,
  MigrationRunner,
  MigrationRunnerFailure,
  MigrationRunnerPerSpaceOptions,
  MigrationRunnerResult,
} from "@prisma-next/framework-components/control";
import { APP_SPACE_ID } from "@prisma-next/framework-components/control";

// ── Inline Result helper ──────────────────────────────────────────────────────
// `@prisma-next/utils` is not a direct dependency, so satisfy `NotOk<F>`
// structurally via TypeScript's structural typing.

function makeNotOk(failure: MigrationRunnerFailure): MigrationRunnerResult {
  return {
    ok: false as const,
    failure,
    assertOk(): never {
      throw new Error("assertOk called on NotOk result");
    },
    assertNotOk() {
      return failure;
    },
  };
}

// ── Runner ────────────────────────────────────────────────────────────────────

/**
 * IDB migration runner.
 *
 * `execute()` returns a structured refusal — IndexedDB only exists in the
 * browser, so the framework's CLI control plane (`db init`, `db update`,
 * `migration apply`) has no live database to talk to. The refusal points users
 * at `prisma-next-idb preflight` for chain validation. The browser apply path
 * goes through `openAndUpgrade()` directly via `auto-migrate.ts` in client-idb.
 *
 * v0.12.0 merged the former single-space `execute({plan, …})` and
 * `executeAcrossSpaces({perSpaceOptions})` into one multi-space
 * `execute({driver, perSpaceOptions})`; the `MultiSpaceCapableRunner` interface
 * and `MultiSpace*` types were removed.
 */
export class IdbMigrationRunner implements MigrationRunner<"idb", "idb"> {
  /**
   * Apply one or more per-space migration plans. IDB cannot be applied from
   * the CLI — `IndexedDB` is a browser API — so this always returns a
   * structured refusal. Authoring stays in `prisma-next migration new` /
   * `prisma-next migration plan`; validation lives in `prisma-next-idb
   * preflight`; apply happens in the browser the next time the user opens the
   * app via `createAutoMigratingIdbClient`.
   */
  async execute(options: {
    readonly driver: ControlDriverInstance<"idb", "idb">;
    readonly perSpaceOptions: ReadonlyArray<MigrationRunnerPerSpaceOptions<"idb", "idb">>;
  }): Promise<MigrationRunnerResult> {
    const failingSpace = options.perSpaceOptions[0]?.space ?? APP_SPACE_ID;
    return makeNotOk({
      code: "IDB-RUNNER-CLI-UNSUPPORTED",
      summary: "IndexedDB migrations cannot be applied from the CLI.",
      why:
        "IndexedDB only exists in the browser; the CLI runs in Node.js. " +
        "There is no live database to apply ops against from this process. " +
        "Migrations apply automatically the next time a user opens the app " +
        "with createAutoMigratingIdbClient.",
      meta: {
        fix:
          "Run `prisma-next-idb preflight` to validate the migration chain " +
          "applies cleanly against a fake-indexeddb shadow before shipping.",
      },
      failingSpace,
    });
  }
}

// Re-export helpers so target-idb/migration exposes them for downstream
// consumers (client-idb auto-migrate, family-idb preflight).
export { applyOneDdlOp, openAndUpgrade, writeMarker, readMarker } from "./apply-ddl-op";
export type { IdbMarkerRecord, MarkerWriteInput } from "./apply-ddl-op";
