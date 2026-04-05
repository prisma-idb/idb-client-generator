export function Footer() {
  return (
    <footer className="border-fd-border/60 border-t px-6 py-12 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="space-y-3">
          <h3 className="text-fd-foreground text-sm font-semibold">Disclaimer</h3>
          <p className="text-fd-muted-foreground max-w-2xl text-sm leading-relaxed">
            Prisma is a trademark of Prisma. Prisma IDB is an independent open-source project and is not affiliated
            with, endorsed by, or sponsored by Prisma.
          </p>
        </div>
        <div className="border-fd-border/60 border-t pt-8">
          <p className="text-fd-muted-foreground text-sm">© {new Date().getFullYear()} Prisma IDB</p>
        </div>
      </div>
    </footer>
  );
}
