import { execSync } from "child_process";
import { Client } from "pg";
import type { FullConfig } from "@playwright/test";
import "dotenv/config";

function escapeIdentifier(name: string): string {
  return name.replace(/"/g, '""');
}

export default async function globalSetup(config: FullConfig) {
  const workerCount = config.workers;
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error("DATABASE_URL environment variable is not set or empty");
  }
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`DATABASE_URL is not a valid URL (got: "${baseUrl}")`);
  }
  const baseName = url.pathname.slice(1);

  // Push schema to the base DB (force-reset for a clean slate)
  execSync("pnpm exec prisma db push --force-reset", {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env },
  });

  // Connect to the postgres admin DB to create worker databases via TEMPLATE
  const adminUrl = new URL(baseUrl);
  adminUrl.pathname = "/postgres";
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();

  try {
    // Terminate all connections to the base DB once before the loop; CREATE DATABASE ... TEMPLATE requires no active connections
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [baseName]
    );

    for (let i = 0; i < workerCount; i++) {
      const workerDb = `${baseName}_worker_${i}`;

      // Terminate any lingering connections to the worker DB from prior runs
      await client.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [workerDb]
      );
      await client.query(`DROP DATABASE IF EXISTS "${escapeIdentifier(workerDb)}"`);
      await client.query(`CREATE DATABASE "${escapeIdentifier(workerDb)}" TEMPLATE "${escapeIdentifier(baseName)}"`);
    }
  } finally {
    await client.end();
  }
}
