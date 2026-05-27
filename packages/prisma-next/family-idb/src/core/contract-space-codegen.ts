import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import type { MigrationMetadata } from "@prisma-next/migration-tools/metadata";
import { dirname, join, relative } from "pathe";
import { chainOrderByMetadata, type ChainablePackage } from "./chain-order";

/**
 * Options for {@link generateContractSpace}.
 *
 * All paths default to framework-conventional values but **should be
 * overridden** when the project's layout differs. The defaults are:
 *
 * - migrations: `<cwd>/migrations/`
 * - contract:   `<cwd>/src/lib/prisma/contract.json`
 * - output:     `<cwd>/src/lib/prisma/contract-space.generated.ts`
 *
 * Pass explicit values (or the corresponding CLI flags) for any project
 * that keeps its contract and generated files elsewhere — Next.js, Nuxt,
 * plain Vite, etc. all typically use different paths.
 */
export interface GenerateContractSpaceOptions {
  readonly cwd: string;
  readonly migrationsDir?: string;
  readonly contractPath?: string;
  readonly outPath?: string;
}

interface LoadedPackage extends ChainablePackage {
  readonly metadata: MigrationMetadata;
}

/**
 * Read every migration package under `<migrationsDir>/app/`, validate the
 * chain's connectivity, then emit a generated TypeScript module that
 * JSON-imports each package's `migration.json` + `ops.json` and assembles
 * them into a `ContractSpace` via `contractSpaceFromJson`. The head ref
 * is inlined as `{ hash, invariants }` derived from the last package's
 * metadata — no on-disk `refs/head.json` is written.
 *
 * (We deliberately avoid writing `migrations/refs/` because the framework's
 * contract-space layout treats top-level `migrations/<subdir>/` as a
 * per-space directory; an orphan `refs/` collides with that. Extension
 * packages — postgis, paradedb, etc. — DO write `migrations/refs/head.json`
 * because their package root IS their single space and there's no
 * ambiguity. App-level layouts use `migrations/app/` for the app space, and
 * the head ref for the app space comes from the latest package's `to`.)
 *
 * Idempotent: re-running produces byte-identical output (modulo
 * migration package list changes). Exit code 0 on success.
 */
export async function generateContractSpace(opts: GenerateContractSpaceOptions): Promise<number> {
  const migrationsDir = opts.migrationsDir ?? join(opts.cwd, "migrations");
  const appDir = join(migrationsDir, "app");
  const contractPath = opts.contractPath ?? join(opts.cwd, "src/lib/prisma/contract.json");
  const outPath = opts.outPath ?? join(opts.cwd, "src/lib/prisma/contract-space.generated.ts");

  const packages = await loadPackages(appDir);
  validateChain(packages);

  // Warn when no packages exist — the output module will have an empty
  // migrations list and `hash: ""`, which breaks createAutoMigratingIdbClient
  // on a fresh database (walkChain throws: "no migration with from === null").
  // The user should run `prisma-next-idb generate-baseline` first.
  if (packages.length === 0) {
    process.stderr.write(
      "Warning: no migration packages found in migrations/app/.\n" +
        "The generated module will have an empty migrations list, which breaks\n" +
        "`createAutoMigratingIdbClient` on a fresh database.\n" +
        "Run `prisma-next-idb generate-baseline` first to create the initial migration.\n\n"
    );
  }

  // Emit the generated module. The head ref is derived inline.
  const outDir = dirname(outPath);
  await mkdir(outDir, { recursive: true });
  const source = renderModule({
    outDir,
    contractPath,
    appDir,
    packages,
  });
  await writeFile(outPath, source, "utf-8");

  process.stdout.write(`Wrote ${outPath} (${packages.length} migration${packages.length === 1 ? "" : "s"})\n`);
  return 0;
}

async function loadPackages(appDir: string): Promise<LoadedPackage[]> {
  let dirs: string[];
  try {
    dirs = (await readdir(appDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  // Load all packages unordered, then chain-walk to derive order. Directory
  // name lexicographic order is unreliable because timestamp formats can
  // mix (e.g. framework's `migration plan` writes `T0337`, hand-authored
  // baselines may use `T120000`). The truth is in metadata.from/to edges.
  const unordered = new Map<string, LoadedPackage>();
  for (const dirName of dirs) {
    const metaPath = join(appDir, dirName, "migration.json");
    const opsPath = join(appDir, dirName, "ops.json");
    try {
      const metaRaw = await readFile(metaPath, "utf-8");
      const metadata = JSON.parse(metaRaw) as MigrationMetadata;
      // existence check for ops.json — we don't parse here because the
      // generated module JSON-imports the file at build time.
      await readFile(opsPath, "utf-8");
      unordered.set(dirName, { dirName, metadata });
    } catch (err) {
      process.stderr.write(
        `Skipping ${dirName}: missing or unreadable migration.json/ops.json ` + `(${(err as Error).message})\n`
      );
    }
  }

  return chainOrderByMetadata(unordered);
}

/**
 * No-op — `chainOrderByMetadata` already enforces all invariants during
 * {@link loadPackages}. Kept as a named hook so callers can compose their
 * own package list and re-validate without calling the full load path.
 */
function validateChain(_packages: ReadonlyArray<LoadedPackage>): void {
  // Validation happens inside `chainOrderByMetadata` during load. No-op here.
}

interface RenderInput {
  readonly outDir: string;
  readonly contractPath: string;
  readonly appDir: string;
  readonly packages: ReadonlyArray<LoadedPackage>;
}

function renderModule(input: RenderInput): string {
  const contractImportPath = toModuleSpecifier(relative(input.outDir, input.contractPath));

  // Local `Contract` import — picks up the IDB-narrowed type from the
  // user's `contract.d.ts` rather than the framework's wider `Contract`.
  // `contract.json` and `contract.d.ts` share a stem, so the .ts module
  // specifier matches via TypeScript's `.json` → bare-import resolution.
  const contractTypeSpecifier = contractImportPath.replace(/\.json$/i, "");

  const importLines: string[] = [
    "// THIS FILE IS AUTO-GENERATED — do not edit by hand.",
    "// Regenerate with: prisma-next-idb generate-contract-space",
    "",
    `import type { Contract } from "${contractTypeSpecifier}";`,
    'import { contractSpaceFromJson } from "@prisma-next/migration-tools/spaces";',
    `import contractJson from "${contractImportPath}" with { type: "json" };`,
  ];

  for (const pkg of input.packages) {
    const id = identFromDir(pkg.dirName);
    const metaPath = toModuleSpecifier(relative(input.outDir, join(input.appDir, pkg.dirName, "migration.json")));
    const opsPath = toModuleSpecifier(relative(input.outDir, join(input.appDir, pkg.dirName, "ops.json")));
    importLines.push(`import ${id}_meta from "${metaPath}" with { type: "json" };`);
    importLines.push(`import ${id}_ops from "${opsPath}" with { type: "json" };`);
  }

  // Inline head ref derivation. The hash comes from the last package's
  // `to`; invariants come from its `providedInvariants` (empty for the
  // IDB app target today — no extension-contributed invariants).
  const last = input.packages[input.packages.length - 1];
  const headRefLiteral =
    last === undefined
      ? '{ hash: "", invariants: [] as const }'
      : `{ hash: ${identFromDir(last.dirName)}_meta.to, invariants: (${identFromDir(last.dirName)}_meta.providedInvariants ?? []) as readonly string[] }`;

  const migrationsBody =
    input.packages.length === 0
      ? "  migrations: [],"
      : [
          "  migrations: [",
          input.packages
            .map((pkg) => {
              const id = identFromDir(pkg.dirName);
              return `    { dirName: ${JSON.stringify(pkg.dirName)}, metadata: ${id}_meta, ops: ${id}_ops },`;
            })
            .join("\n"),
          "  ],",
        ].join("\n");

  return [
    ...importLines,
    "",
    "export const contractSpace = contractSpaceFromJson<Contract>({",
    "  contractJson,",
    migrationsBody,
    `  headRef: ${headRefLiteral},`,
    "});",
    "",
  ].join("\n");
}

function identFromDir(dirName: string): string {
  return `mig_${dirName.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

/**
 * Coerce a `pathe` relative path into a TypeScript module specifier.
 * - Adds a leading `./` if the path doesn't already start with `.` or `/`.
 * - Leaves absolute and parent-relative paths alone.
 */
function toModuleSpecifier(p: string): string {
  if (p.startsWith(".") || p.startsWith("/")) return p;
  return `./${p}`;
}
