/**
 * Browser-side auto-migration e2e test.
 *
 * Verifies that `createAutoMigratingIdbClient` correctly upgrades a database
 * that was created under an older schema version (v1: users + random_store,
 * no posts) to the current version (v2: + posts) when the app loads.
 *
 * The test pre-seeds a v1-state IDB using the raw IndexedDB API (bypassing
 * the ORM), then navigates to the app. The auto-migrating client should:
 *   1. Read the marker → v1 storageHash
 *   2. Walk the contractSpace chain → find the "add posts" migration
 *   3. Apply the DDL ops (createObjectStore + createIndex) in a version-change tx
 *   4. Update the marker → v2 storageHash
 *
 * After migration we drive the ORM through the query-runner shell to confirm
 * both stores are functional and data persists across a page reload.
 */

import { expect, test } from "@playwright/test";
import { QueryRunner } from "./helpers";

// The storageHash baked into the baseline migration package (users only, no posts).
// This is the value the marker store holds when a DB was last opened against v1.
const V1_STORAGE_HASH = "sha256:46a587fce453e2298b888ce5307312ac010fafb203b9f0ab188eb4fb6be17bc0";

let dbCounter = 0;
function uniqueV1DbName(workerIndex: number): string {
  return `pn-v1mig-w${workerIndex}-${++dbCounter}-${Date.now().toString(36)}`;
}

test.describe("auto-migration: incremental upgrade in the browser", () => {
  test("v1 DB (users only) is upgraded to v2 (+posts) on first load; data survives reload", async ({
    page,
  }, testInfo) => {
    const dbName = uniqueV1DbName(testInfo.workerIndex);

    // ── Step 1: seed a v1-state IDB before the app can touch it ─────────────
    // Navigate to the app root first (any URL on the same origin) so that
    // `indexedDB` is available in the page context. The default DB that loads
    // here is independent of our test dbName.
    await page.goto("/");

    await page.evaluate(
      async ({ dbName, markerHash }) => {
        await new Promise<void>((resolve, reject) => {
          const req = indexedDB.open(dbName, 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            // Baseline schema: marker store + random_store + users (with indexes)
            db.createObjectStore("_prisma_next_marker", { keyPath: "space" });
            db.createObjectStore("random_store", { keyPath: "id" });
            const users = db.createObjectStore("users", { keyPath: "id" });
            users.createIndex("byEmail", "email", { unique: true });
            users.createIndex("byScore", "score");
          };
          req.onsuccess = () => {
            const db = req.result;
            // Write the v1 marker so the auto-migrating client knows where
            // this DB sits in the migration chain.
            const tx = db.transaction("_prisma_next_marker", "readwrite");
            tx.objectStore("_prisma_next_marker").put({ space: "app", storageHash: markerHash });
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
          req.onerror = () => reject(req.error);
        });
      },
      { dbName, markerHash: V1_STORAGE_HASH }
    );

    // ── Step 2: load the app with the v1 DB ──────────────────────────────────
    // The auto-migrating client reads the marker (v1 hash), walks the
    // contractSpace chain, and applies the "add posts" migration ops before
    // handing back the typed client.
    await page.goto(`/?db=${dbName}`);
    await expect(page.getByTestId("run-query")).toBeEnabled({ timeout: 15_000 });

    const runner = new QueryRunner(page);

    // ── Step 3: verify posts store was created by the migration ──────────────
    const initialPosts = (await runner.run(`orm.posts.all()`)) as unknown[];
    expect(initialPosts).toHaveLength(0);

    // ── Step 4: verify users store (v1 store) still works post-migration ─────
    const initialUsers = (await runner.run(`orm.users.all()`)) as unknown[];
    expect(initialUsers).toHaveLength(0);

    // ── Step 5: write data into both stores ──────────────────────────────────
    await runner.run(`
      orm.users.create({
        id: "u1", name: "Alice", email: "alice@test.com",
        bio: null, score: 42, active: true, joinedAt: new Date()
      })
    `);

    const createdPost = (await runner.run(`
      orm.posts.create({
        id: "p1",
        title: "Post After Migration",
        content: null,
        published: true,
        views: 0,
        authorId: "u1",
        createdAt: new Date()
      })
    `)) as { id: string; title: string };
    expect(createdPost).toMatchObject({ id: "p1", title: "Post After Migration" });

    // ── Step 6: reload — DB is already at v2, no re-migration should occur ───
    await page.reload();
    await expect(page.getByTestId("run-query")).toBeEnabled({ timeout: 15_000 });

    const runner2 = new QueryRunner(page);

    const usersAfterReload = (await runner2.run(`orm.users.all()`)) as Array<{ id: string }>;
    expect(usersAfterReload).toHaveLength(1);
    expect(usersAfterReload[0]).toMatchObject({ id: "u1" });

    const postsAfterReload = (await runner2.run(`orm.posts.all()`)) as Array<{
      id: string;
      title: string;
    }>;
    expect(postsAfterReload).toHaveLength(1);
    expect(postsAfterReload[0]).toMatchObject({ id: "p1", title: "Post After Migration" });
  });
});
