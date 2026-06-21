# Maintainer guide

## Releasing `@prisma-next-idb/*`

Releases use [Changesets](https://github.com/changesets/changesets). All six packages are versioned in lockstep.

1. **Author a changeset** (on any branch, or directly on `main`):

   ```bash
   pnpm changeset
   ```

   The prompt asks which packages changed and the bump level (`patch`/`minor`/`major`). Commit the generated `.changeset/<slug>.md` file.

2. **Merge to `main`.** The `release-prisma-next` workflow opens a **"chore: release prisma-next packages"** PR that bumps versions, writes `CHANGELOG.md` entries (with PR links and contributor @-mentions), and deletes the changeset file.

3. **Merge the release PR.** The workflow re-runs, finds no pending changesets, and publishes all six packages to npm with provenance attestation.

### Dry-run

```bash
pnpm build --filter=@prisma-next-idb/*
pnpm --filter=@prisma-next-idb/* publish --dry-run
```

Verify only `dist/` is listed for each package — not `src/` or `test/`.

### npm trusted publisher setup (one-time, per package)

Publishing uses GitHub Actions OIDC — no stored npm token needed. Configure each package on npmjs.com once, after its first publish:

1. Go to the package page → **Settings** → **Trusted Publisher** → **GitHub Actions**
2. Fill in:
   - **Organization or user**: `prisma-idb`
   - **Repository**: `idb-client-generator`
   - **Workflow filename**: `release-prisma-next.yml`
3. Save — repeat for all six packages.

> **First publish**: trusted publisher config requires the package to already exist. For the initial publish, `npm login` locally and run `pnpm --filter=@prisma-next-idb/* publish`, then immediately configure trusted publishers.

### Changeset PR enforcement

Two things block merging a `packages/prisma-next/**` PR without a changeset:

- **[changeset-bot](https://github.com/apps/changeset-bot)** — install on the repo once. Posts a comment on every PR with changeset status and a direct link to create one.
- **`changeset-check.yml`** — runs `changeset status --since=origin/main` on PRs. Set **"Changeset required"** as a required status check in **Settings → Branches → main → Require status checks**.

## Releasing `packages/generator`

The generator uses `release-it`. Run from the package directory:

```bash
cd packages/generator
pnpm release
```

The `release.yml` workflow fires automatically on push to `main` when `packages/generator/**` changes.
