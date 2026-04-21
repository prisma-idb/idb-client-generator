import type { MetadataRoute } from "next";
import { source } from "@/lib/source";

const siteUrl = "https://prisma-idb.dev";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const docPages = source.getPages().map((page) => ({
    url: `${siteUrl}${page.url}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: page.slugs.length <= 1 ? 0.9 : 0.7,
  }));

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    ...docPages,
  ];
}
