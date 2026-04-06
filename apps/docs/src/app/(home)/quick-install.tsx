import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

const schemaSnippet = `generator prismaIDB {
  provider = "idb-client-generator"
  output   = "./prisma-idb"
}`;

export async function QuickInstall() {
  const badgeClass =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(32,100%,50%)] text-sm font-bold text-white shadow-md shadow-[hsl(32,100%,50%)]/25";

  return (
    <section className="border-fd-border/60 border-t px-6 py-16 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h2 className={`${GeistSans.className} text-fd-foreground mb-4 text-center text-3xl font-bold sm:text-4xl`}>
          Up and running in three steps
        </h2>
        <p className="text-fd-muted-foreground mx-auto mb-12 max-w-lg text-center text-base">
          Add the generator to an existing Prisma project — no config files, no runtime dependencies.
        </p>

        <div className="space-y-8">
          {/* Step 1 */}
          <div className="flex gap-5">
            <div className={badgeClass}>1</div>
            <div className="min-w-0 flex-1">
              <p className="text-fd-foreground mb-2 font-semibold">Install</p>
              <div className="[&_figure]:m-0!">
                <ServerCodeBlock code="pnpm add idb @prisma-idb/idb-client-generator -D" lang="bash" />
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-5">
            <div className={badgeClass}>2</div>
            <div className="min-w-0 flex-1">
              <p className="text-fd-foreground mb-2 font-semibold">
                Add the generator to your <code className={`${GeistMono.className} text-[13px]`}>schema.prisma</code>
              </p>
              <div className="[&_figure]:m-0!">
                <ServerCodeBlock code={schemaSnippet} lang="prisma" />
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-5">
            <div className={badgeClass}>3</div>
            <div className="min-w-0 flex-1">
              <p className="text-fd-foreground mb-2 font-semibold">Generate</p>
              <div className="[&_figure]:m-0!">
                <ServerCodeBlock code="npx prisma generate" lang="bash" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/docs/quick-start"
            className="text-fd-accent inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            Full quick-start guide
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
