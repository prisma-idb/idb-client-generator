import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";

const idbCode = `const db = await openDB("MyDB", 1);

const posts = await db.getAllFromIndex(
  "posts", "byAuthor", userId
);

const result = [];
for (const post of posts) {
  if (!post.published) continue;
  const comments = await db.getAllFromIndex(
    "comments", "byPost", post.id
  );
  result.push({ ...post, comments });
}

result.sort(
  (a, b) => b.createdAt - a.createdAt
);
// manual joins, no types, no filtering`;

const prismaIdbCode = `const posts = await idb.post.findMany({
  where: {
    authorId: userId,
    published: true,
  },
  include: {
    comments: {
      orderBy: { createdAt: "desc" },
    },
  },
  orderBy: { createdAt: "desc" },
});

// Typed. Relations included.
// Filtering, sorting, nesting —
// all generated from your schema.`;

export async function CodeComparison() {
  return (
    <section className="px-6 py-16 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <h2 className={`${GeistSans.className} text-fd-foreground mb-4 text-center text-3xl font-bold sm:text-4xl`}>
          The same API. Zero learning curve.
        </h2>
        <p className="text-fd-muted-foreground mx-auto mb-4 max-w-xl text-center text-base">
          Even with the <code className={`${GeistMono.className} text-fd-muted-foreground text-[13px]`}>idb</code>{" "}
          library, querying across relations means manual index lookups, joins in application code, and zero type
          safety:
        </p>
        <p className="text-fd-muted-foreground mx-auto mb-12 max-w-2xl text-center text-sm">
          Supports <code className={`${GeistMono.className} text-[12px]`}>findMany</code>,{" "}
          <code className={`${GeistMono.className} text-[12px]`}>findFirst</code>,{" "}
          <code className={`${GeistMono.className} text-[12px]`}>findUnique</code>,{" "}
          <code className={`${GeistMono.className} text-[12px]`}>create</code>,{" "}
          <code className={`${GeistMono.className} text-[12px]`}>update</code>,{" "}
          <code className={`${GeistMono.className} text-[12px]`}>delete</code>,{" "}
          <code className={`${GeistMono.className} text-[12px]`}>upsert</code>, relations, nested writes, and more.
        </p>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Before */}
          <div>
            <div className="mb-3 flex items-center gap-2.5">
              <div className="h-2 w-2 rounded-full bg-zinc-500" />
              <span className="text-fd-muted-foreground text-sm font-medium">idb (IndexedDB wrapper)</span>
            </div>
            <div className="opacity-60">
              <ServerCodeBlock code={idbCode} lang="ts" />
            </div>
          </div>

          {/* After */}
          <div>
            <div className="mb-3 flex items-center gap-2.5">
              <div className="h-2 w-2 rounded-full bg-[hsl(32,100%,50%)]" />
              <span className="text-sm font-semibold text-[hsl(32,100%,50%)]">Prisma IDB</span>
            </div>
            <div className="overflow-hidden rounded-xl shadow-xl ring-1 shadow-[hsl(32,100%,50%)]/6 ring-[hsl(32,100%,50%)]/20">
              <ServerCodeBlock code={prismaIdbCode} lang="ts" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
