import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";

export async function QuickInstall() {
  return (
    <section className="border-fd-border/60 border-t px-6 py-12 lg:px-8">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4">
        <p className="text-fd-muted-foreground text-sm font-medium tracking-wide uppercase">Get started in seconds</p>
        <div className="w-full [&_figure]:!m-0">
          <ServerCodeBlock code="pnpm add @prisma-idb/idb-client-generator -D" lang="bash" />
        </div>
      </div>
    </section>
  );
}
