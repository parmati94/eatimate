import type { MetadataRoute } from "next";
import { listChains } from "@/lib/data";
import { listPairs, pairSlug } from "@/lib/meals";
import { SITE_URL } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const chains = await listChains();
  // Only the canonical (alphabetical) ordering; the mirror URLs point here.
  const pairs = await listPairs();

  // A page is as fresh as the chart it is built from. Chain pages carry their
  // own `retrieved`; the derived pages have to borrow it, because otherwise a
  // re-ingest silently changes their figures with nothing telling a crawler to
  // come back -- which is how the comparison pages went a full launch week
  // without a freshness signal of any kind.
  const retrieved = new Map(chains.map((c) => [c.slug, +new Date(c.source.retrieved)]));
  const freshest = (slugs: string[]) => {
    const times = slugs.map((s) => retrieved.get(s)).filter((t): t is number => !!t);
    return times.length ? new Date(Math.max(...times)) : undefined;
  };
  const allChains = freshest(chains.map((c) => c.slug));

  return [
    // The homepage and the comparison index both list live figures, so they
    // move whenever any chain does.
    { url: `${SITE_URL}/`, lastModified: allChains, changeFrequency: "weekly", priority: 1 },
    {
      url: `${SITE_URL}/compare`,
      lastModified: allChains,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    // No lastModified on these two: they genuinely do not change, and a date
    // invented from the build would be a freshness claim we cannot honour.
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
      // The newer of the two charts: either re-ingest changes this page.
      lastModified: freshest([a, b]),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
