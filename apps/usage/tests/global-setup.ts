import { execSync } from "child_process";
import { Client } from "pg";
import type { FullConfig } from "@playwright/test";
import "dotenv/config";

export default async function globalSetup(config: FullConfig) {
  const workerCount = config.workers;
  const baseUrl = process.env.DATABASE_URL!;
  const url = new URL(baseUrl);
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

  for (let i = 0; i < workerCount; i++) {
    const workerDb = `${baseName}_worker_${i}`;

    // Terminate any lingering connections to the worker DB from prior runs
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [workerDb]
    );
    await client.query(`DROP DATABASE IF EXISTS "${workerDb}"`);

    // Terminate any connections to the base DB before templating (CREATE DATABASE TEMPLATE requires it)
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [baseName]
    );
    await client.query(`CREATE DATABASE "${workerDb}" TEMPLATE "${baseName}"`);
  }

  await client.end();
}
