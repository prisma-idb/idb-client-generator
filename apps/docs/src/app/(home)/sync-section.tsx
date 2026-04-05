import { GeistSans } from "geist/font/sans";
import { Send, Lock, RefreshCw } from "lucide-react";
import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import { SyncTabs } from "./sync-tabs";

const schemaCode = `generator prismaIDB {
  provider   = "idb-client-generator"
  output     = "./prisma-idb"
  outboxSync = true
  rootModel  = "User"
}`;

const endpointsCode = `// POST /api/sync/push
import { applyPush } from "./prisma-idb/server";

const session = await auth.getSession(request);
if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

const results = await applyPush({
  events: body.events,
  scopeKey: session.userId,
  prisma,
});
return Response.json(results);

// POST /api/sync/pull
import { pullAndMaterializeLogs } from "./prisma-idb/server";

const session = await auth.getSession(request);
if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

const logsWithRecords = await pullAndMaterializeLogs({
  prisma,
  scopeKey: session.userId,
  lastChangelogId: body.cursor,
});
return Response.json({
  cursor: logsWithRecords.at(-1)?.id ?? body.cursor ?? null,
  logsWithRecords,
});`;

const workerCode = `const worker = client.createSyncWorker({
  push: {
    handler: async (events) => {
      const res = await fetch("/api/sync/push", {
        method: "POST",
        body: JSON.stringify({ events }),
      });
      return res.json();
    },
  },
  pull: {
    handler: async (cursor) => {
      const res = await fetch("/api/sync/pull", {
        method: "POST",
        body: JSON.stringify({ cursor }),
      });
      return res.json();
    },
    getCursor: () => localStorage.getItem("syncCursor") ?? undefined,
    setCursor: (cursor) => localStorage.setItem("syncCursor", cursor),
  },
});

worker.start();`;

export async function SyncSection() {
  const schemaBlock = await ServerCodeBlock({ code: schemaCode, lang: "prisma" });
  const endpointsBlock = await ServerCodeBlock({ code: endpointsCode, lang: "ts" });
  const workerBlock = await ServerCodeBlock({ code: workerCode, lang: "ts" });

  return (
    <section className="border-fd-border/60 border-y px-6 py-16 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2">
          <div>
            <h2 className={`${GeistSans.className} text-fd-foreground text-3xl leading-tight font-bold sm:text-4xl`}>
              Sync that&apos;s <span className="text-fd-accent">built in</span>,
              <br />
              not bolted on.
            </h2>

            <p className="text-fd-muted-foreground mt-6 max-w-md text-lg leading-relaxed">
              Most IndexedDB wrappers stop at CRUD. Prisma IDB generates a full sync engine from your schema — wire up
              two endpoints and a sync worker, and it handles the rest.
            </p>

            <div className="mt-8 space-y-6">
              <div className="flex gap-4">
                <Send className="text-fd-accent mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="text-fd-foreground font-semibold">Works Offline, Syncs Later</p>
                  <p className="text-fd-muted-foreground mt-1 text-sm">
                    Mutations queue locally and push automatically with retry and batching when the network is back.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <Lock className="text-fd-accent mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="text-fd-foreground font-semibold">Built-in Authorization</p>
                  <p className="text-fd-muted-foreground mt-1 text-sm">
                    Every record knows who owns it — authorization is built into your schema, not bolted on with
                    middleware.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <RefreshCw className="text-fd-accent mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="text-fd-foreground font-semibold">Conflict Resolution</p>
                  <p className="text-fd-muted-foreground mt-1 text-sm">
                    When two devices edit the same record, the server decides. Pull operations are fast and predictable.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <SyncTabs schemaBlock={schemaBlock} endpointsBlock={endpointsBlock} workerBlock={workerBlock} />
        </div>
      </div>
    </section>
  );
}
