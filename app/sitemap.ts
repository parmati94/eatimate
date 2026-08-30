import type { MetadataRoute } from "next";
import { listChains } from "@/lib/data";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const chains = await listChains();
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/about`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.1 },
    ...chains.map((c) => ({
      url: `${SITE_URL}/${c.slug}`,
      lastModified: new Date(c.source.retrieved),
      changeFrequency: "monthly" as const,
      priority: 0.9,
    })),
  ];
}
