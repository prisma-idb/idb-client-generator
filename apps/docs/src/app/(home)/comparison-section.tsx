import { GeistSans } from "geist/font/sans";
import { Check, Minus } from "lucide-react";

type Support = "yes" | "no" | "partial";

interface Feature {
  name: string;
  prismaIdb: Support;
  dexie: Support;
  rxdb: Support;
  electricSql: Support;
}

const features: Feature[] = [
  { name: "Prisma-compatible API", prismaIdb: "yes", dexie: "no", rxdb: "no", electricSql: "no" },
  { name: "Type-safe from schema", prismaIdb: "yes", dexie: "partial", rxdb: "partial", electricSql: "yes" },
  { name: "Relations & nested queries", prismaIdb: "yes", dexie: "no", rxdb: "no", electricSql: "partial" },
  { name: "Bidirectional sync", prismaIdb: "yes", dexie: "no", rxdb: "yes", electricSql: "yes" },
  { name: "Conflict resolution", prismaIdb: "yes", dexie: "no", rxdb: "yes", electricSql: "yes" },
  { name: "Offline-first", prismaIdb: "yes", dexie: "yes", rxdb: "yes", electricSql: "yes" },
  { name: "No vendor lock-in", prismaIdb: "yes", dexie: "yes", rxdb: "partial", electricSql: "no" },
  { name: "Zero runtime config", prismaIdb: "yes", dexie: "no", rxdb: "no", electricSql: "no" },
];

const tools = [
  { key: "prismaIdb" as const, label: "Prisma IDB", highlight: true },
  { key: "dexie" as const, label: "Dexie.js" },
  { key: "rxdb" as const, label: "RxDB" },
  { key: "electricSql" as const, label: "ElectricSQL" },
];

function SupportIcon({ support }: { support: Support }) {
  if (support === "yes") {
    return (
      <span role="img" aria-label="Supported">
        <Check className="mx-auto h-4 w-4 text-emerald-500" />
      </span>
    );
  }
  if (support === "partial") {
    return (
      <span role="img" aria-label="Partial support">
        <Minus className="mx-auto h-4 w-4 text-amber-500" />
      </span>
    );
  }
  return (
    <span role="img" aria-label="Not supported">
      <Minus className="mx-auto h-4 w-4 text-zinc-400 dark:text-zinc-600" />
    </span>
  );
}

export function ComparisonSection() {
  return (
    <section className="border-fd-border/60 border-t px-6 py-16 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <h2 className={`${GeistSans.className} text-fd-foreground mb-4 text-center text-3xl font-bold sm:text-4xl`}>
          How does it compare?
        </h2>
        <p className="text-fd-muted-foreground mx-auto mb-12 max-w-xl text-center text-base">
          There are great tools for client-side storage. Prisma IDB is built for teams already using Prisma who want the
          same API in the browser — with sync included.
        </p>

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="overflow-x-auto">
            <table className="w-full min-w-135 text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-100/80 dark:border-zinc-800 dark:bg-zinc-900/80">
                  <th className="text-fd-muted-foreground py-3.5 pr-4 pl-5 text-left font-medium">Feature</th>
                  {tools.map((tool) => (
                    <th
                      key={tool.key}
                      className={`py-3.5 text-center font-medium ${
                        tool.highlight ? "text-[hsl(32,100%,50%)]" : "text-fd-muted-foreground"
                      }`}
                    >
                      {tool.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {features.map((feature, i) => (
                  <tr
                    key={feature.name}
                    className={`border-zinc-200 dark:border-zinc-800 ${i < features.length - 1 ? "border-b" : ""}`}
                  >
                    <td className="text-fd-foreground py-3.5 pr-4 pl-5 font-medium">{feature.name}</td>
                    {tools.map((tool) => (
                      <td
                        key={tool.key}
                        className={`py-3.5 text-center ${tool.highlight ? "bg-[hsl(32,100%,50%)]/3" : ""}`}
                      >
                        <SupportIcon support={feature[tool.key]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-fd-muted-foreground mt-5 text-center text-xs">
          <Check className="mr-1 inline h-3 w-3 text-emerald-500" /> Supported{" "}
          <Minus className="mr-1 ml-3 inline h-3 w-3 text-amber-500" /> Partial{" "}
          <Minus className="mr-1 ml-3 inline h-3 w-3 text-zinc-400 dark:text-zinc-600" /> Not included
        </p>
      </div>
    </section>
  );
}
