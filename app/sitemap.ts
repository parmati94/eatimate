import type { MetadataRoute } from "next";
import { listChains } from "@/lib/data";
import { listPairs, pairSlug } from "@/lib/meals";
import { SITE_URL } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const chains = await listChains();
  // Only the canonical (alphabetical) ordering; the mirror URLs point here.
  const pairs = await listPairs();
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/compare`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/about`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.1 },
    ...chains.map((c) => ({
      url: `${SITE_URL}/${c.slug}`,
      lastModified: new Date(c.source.retrieved),
      changeFrequency: "monthly" as const,
      priority: 0.9,
    })),
    ...pairs.map(([a, b]) => ({
      url: `${SITE_URL}/compare/${pairSlug(a, b)}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
