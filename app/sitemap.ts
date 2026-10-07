import type { MetadataRoute } from "next";
import { listChains } from "@/lib/data";
import { INDEXED_PAIRS } from "@/lib/meals";
import { SITE_URL } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // The pages we stand behind in search: home, one calculator per chain, the
  // two pages saying who runs this and what it records, and the handful of
  // comparisons people actually search for. The other pairs are noindexed
  // (see INDEXED_PAIRS) and so are left out -- a sitemap listing pages that
  // ask not to be indexed is a mixed signal.
  const chains = await listChains();

  // A page is as fresh as the chart it is built from, or as the last hand
  // edit to it, whichever is later. Chain pages carry their own `retrieved`;
  // the homepage and the comparisons have to borrow it, because otherwise a
  // re-ingest silently changes their figures with nothing telling a crawler
  // to come back. `updated` covers the other way a page moves: the DIG -> Dig
  // Inn rename changed the title on every page naming the chain and, read
  // from `retrieved` alone, none of them had changed.
  const retrieved = new Map(
    chains.map((c) => [
      c.slug,
      Math.max(+new Date(c.source.retrieved), c.updated ? +new Date(c.updated) : 0),
    ]),
  );
  const freshest = (slugs: string[]) => {
    const times = slugs.map((s) => retrieved.get(s)).filter((t): t is number => !!t);
    return times.length ? new Date(Math.max(...times)) : undefined;
  };
  const allChains = freshest(chains.map((c) => c.slug));

  return [
    // The homepage lists live figures, so it moves whenever any chain does.
    { url: `${SITE_URL}/`, lastModified: allChains, changeFrequency: "weekly", priority: 1 },
    // No lastModified on these two: they genuinely do not change, and a date
    // invented from the build would be a freshness claim we cannot honour.
    { url: `${SITE_URL}/about`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.1 },
    ...chains.map((c) => ({
      url: `${SITE_URL}/${c.slug}`,
      lastModified: new Date(retrieved.get(c.slug)!),
      changeFrequency: "monthly" as const,
      priority: 0.9,
    })),
    ...[...INDEXED_PAIRS].map((slug) => ({
      url: `${SITE_URL}/compare/${slug}`,
      // The newer of the two charts: either re-ingest changes this page.
      lastModified: freshest(slug.split("-vs-")),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
