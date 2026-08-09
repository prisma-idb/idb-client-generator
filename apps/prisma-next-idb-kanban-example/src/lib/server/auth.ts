import { env } from "$env/dynamic/private";
import { getRequestEvent } from "$app/server";
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { Pool } from "pg";

/**
 * better-auth against the SAME Postgres database as the domain data — its
 * `user`/`session`/`account`/`verification` tables live in
 * `schema.prisma` (see that file's `User`/`Session`/`Account`/`Verification`
 * models), created by the `20260809T1112_auth` migration, not by
 * better-auth's own `@better-auth/cli migrate`. `database: Pool` (Kysely's
 * default camelCase table naming) is what makes those column names line up
 * with what better-auth expects out of the box.
 *
 * A separate `pg.Pool` from `src/lib/server/db.ts`'s `@prisma-next/postgres`
 * connection — different libraries, no reason to couple their connection
 * lifecycles.
 *
 * Anonymous-only for now (see the `anonymous()` plugin) — no social
 * providers configured yet. Add `socialProviders` here when needed; nothing
 * else in this setup assumes anonymous-only.
 */
if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — copy .env.example to .env and run `pnpm db:up && pnpm db:init`.");
}
if (!env.BETTER_AUTH_SECRET) {
  throw new Error(
    "BETTER_AUTH_SECRET is not set — copy .env.example to .env (generate one with `openssl rand -base64 32`)."
  );
}

export const auth = betterAuth({
  database: new Pool({ connectionString: env.DATABASE_URL }),
  secret: env.BETTER_AUTH_SECRET,
  plugins: [sveltekitCookies(getRequestEvent), anonymous()],
});
