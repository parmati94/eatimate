import type { Metadata } from "next";
import CompareStrip, { type CompareLink } from "@/components/CompareStrip";
import CorrectionsNote, { DerivedNote } from "@/components/CorrectionsNote";
import NutritionTable from "@/components/NutritionTable";
import { notFound } from "next/navigation";
import MealBuilder from "@/components/MealBuilder";
import { IconExternal } from "@/components/icons";
import { getChain, listChains } from "@/lib/data";
import { pairsWith } from "@/lib/meals";

// The chain data ships inside the image, so every page is known at build time.
// Rendering them once makes the HTML edge-cacheable instead of re-parsing 400+
// components per request. An unknown slug still 404s via notFound().
export async function generateStaticParams() {
  return (await listChains()).map((c) => ({ chain: c.slug }));
}

export async function generateMetadata(
  props: PageProps<"/[chain]">,
): Promise<Metadata> {
  const { chain: slug } = await props.params;
  const chain = await getChain(slug);
  if (!chain) return {};
  // Targets the informational query ("wingstop nutrition facts") as well as the
  // calculator one. Set absolute so the "· Eatimate" template doesn't push the
  // longest chain names past what search results actually show.
  const title = `${chain.name} Nutrition Facts & Calorie Calculator`;
  const description =
    chain.blurb ??
    `Build your ${chain.name} meal ingredient by ingredient and get calories, protein, carbs, fat, and sodium totals.`;
  const url = `/${chain.slug}`;
  // openGraph/twitter replace the parent object rather than merging into it, so
  // type, siteName and card have to be repeated here.
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} · Eatimate`,
      description,
      url,
      type: "website",
      siteName: "Eatimate",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · Eatimate`,
      description,
    },
  };
}

export default async function ChainPage(props: PageProps<"/[chain]">) {
  const { chain: slug } = await props.params;
  const chain = await getChain(slug);
  if (!chain) notFound();

  // Narrowed here rather than in the component: CompareStrip is a client
  // component, so whatever it takes is serialised into the page.
  const recommended = await pairsWith(slug);
  const links: CompareLink[] = recommended.map((p) => {
    const isFirst = p.chains[0].slug === slug;
    const other = isFirst ? p.chains[1] : p.chains[0];
    return {
      href: `/compare/${p.slug}`,
      side: isFirst ? "a" : "b",
      other: { slug: other.slug, name: other.name, glyph: other.glyph },
    };
  });
  const suggested = new Set([slug, ...links.map((l) => l.other.slug)]);
  const others = (await listChains())
    .filter((c) => !suggested.has(c.slug))
    .map((c) => ({ slug: c.slug, name: c.name }));
  const sourceUrl = chain.source.pdf_url ?? chain.source.html_url!;

  return (
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 sm:pt-8 lg:pb-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {chain.name}{" "}
            <span className="font-semibold text-muted">
              Nutrition Calculator
            </span>
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Build your order — totals update as you go.
          </p>
        </div>
        <a
          href={sourceUrl}
          rel="nofollow noopener"
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-fg"
        >
          <IconExternal className="h-3.5 w-3.5" />
          Source {chain.source.pdf_url ? "PDF" : "page"} ·{" "}
          {chain.source.retrieved}
        </a>
      </div>

      {chain.blurb && (
        <p className="mb-5 max-w-2xl text-sm leading-relaxed text-muted">
          {chain.blurb}
        </p>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: `${chain.name} Nutrition Calculator`,
            applicationCategory: "HealthApplication",
            operatingSystem: "Web",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            description:
              chain.blurb ??
              `Build your ${chain.name} meal ingredient by ingredient and get full nutrition totals.`,
          }),
        }}
      />

      <MealBuilder chain={chain} />

      <CompareStrip
        chain={{ slug: chain.slug, name: chain.name }}
        links={links}
        others={others}
      />

      <NutritionTable chain={chain} />

      <footer className="mt-6 space-y-1 border-t border-line pt-4 text-xs leading-relaxed text-muted">
        <p>
          Not affiliated with or endorsed by {chain.name}. Nutrition values are
          approximations derived from{" "}
          <a
            href={sourceUrl}
            className="underline decoration-line underline-offset-2 hover:text-fg"
            rel="nofollow noopener"
          >
            {chain.name}&apos;s published nutrition data
          </a>{" "}
          (retrieved {chain.source.retrieved}); actual values vary with
          portioning and preparation. Verify allergen and dietary decisions with
          the restaurant directly.
        </p>
        {chain.disclaimer_extra && <p>{chain.disclaimer_extra}</p>}
        <DerivedNote chain={chain} />
        <CorrectionsNote chain={chain} />
      </footer>
    </main>
  );
}
