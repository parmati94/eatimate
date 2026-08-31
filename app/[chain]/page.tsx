import type { Metadata } from "next";
import type { CSSProperties } from "react";
import CompareStrip, { type CompareLink } from "@/components/CompareStrip";
import CorrectionsNote, { DerivedNote } from "@/components/CorrectionsNote";
import NutritionTable from "@/components/NutritionTable";
import { notFound } from "next/navigation";
import MealBuilder from "@/components/MealBuilder";
import { IconExternal } from "@/components/icons";
import { chainTints, getChain, listChains } from "@/lib/data";
import { pairsWith } from "@/lib/meals";
import { possessive } from "@/lib/text";

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
  // The provenance clause lives here rather than in the blurb itself. On the
  // page it was the fourth restatement of the same fact; in a search snippet it
  // is the reason to click, so the description keeps it.
  const description = chain.blurb
    ? `${chain.blurb} Every figure from ${possessive(chain.name)} own published nutrition data.`
    : `Build your ${chain.name} meal ingredient by ingredient and get calories, protein, carbs, fat, and sodium totals.`;
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
  const tints = await chainTints();
  const links: CompareLink[] = recommended.map((p) => {
    const isFirst = p.chains[0].slug === slug;
    const other = isFirst ? p.chains[1] : p.chains[0];
    return {
      href: `/compare/${p.slug}`,
      side: isFirst ? "a" : "b",
      other: {
        slug: other.slug,
        name: other.name,
        glyph: other.glyph,
        tint: tints.get(other.slug)!,
      },
    };
  });
  const suggested = new Set([slug, ...links.map((l) => l.other.slug)]);
  const others = (await listChains())
    .filter((c) => !suggested.has(c.slug))
    .map((c) => ({ slug: c.slug, name: c.name }));
  const sourceUrl = chain.source.pdf_url ?? chain.source.html_url!;

  const tint = tints.get(chain.slug)!;

  return (
    // data-chain paints this page's accent role in the chain's own colour, so
    // selection and progress read as "this restaurant" while the running total
    // stays brand teal on every page.
    <main
      data-chain
      style={
        { "--chain-l": tint.light, "--chain-d": tint.dark } as CSSProperties
      }
      className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-32 sm:pt-8 lg:pb-8"
    >
      {/*
        Title, source, builder -- and nothing else above the fold.

        This block used to carry a dek ("Build your order — totals update as you
        go.") and the blurb as well. All three said the same thing, and on a
        390px screen they pushed the first tappable ingredient to 328px: 39% of
        the screen spent reading, on a page whose whole use case is standing in
        a queue. The dek is gone and the blurb moved below the builder, where it
        does exactly as much for search and none of the harm.
      */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {chain.name}{" "}
          <span className="font-semibold text-muted">Nutrition Calculator</span>
        </h1>
        <a
          href={sourceUrl}
          rel="nofollow noopener"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs text-muted transition-colors hover:border-fg/30 hover:text-fg"
        >
          <IconExternal className="h-3.5 w-3.5" />
          Source {chain.source.pdf_url ? "PDF" : "page"} ·{" "}
          {chain.source.retrieved}
        </a>
      </div>

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

      {/* Reading, so it sits after the thing you came to use. Unchanged text:
          the keywords a search lands on are all still here. */}
      {chain.blurb && (
        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-muted">
          {chain.blurb}
        </p>
      )}

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
            {possessive(chain.name)} published nutrition data
          </a>{" "}
          (retrieved {chain.source.retrieved}); actual values vary with
          portioning and preparation. Verify allergen and dietary decisions with
          the restaurant directly.
        </p>
        {/* Collapsed, not cut: on Buffalo Wild Wings this note runs to 135
            words, and leading with them buries the page. Every word is still
            in the DOM, which is all a crawler needs, and the same <details>
            pattern is used by the two notes directly below. */}
        {chain.disclaimer_extra && (
          <details className="group">
            <summary className="cursor-pointer list-none underline decoration-line underline-offset-2 hover:text-fg">
              How these numbers were built
              <span className="ml-1 text-muted group-open:hidden" aria-hidden>
                &#9656;
              </span>
              <span
                className="ml-1 hidden text-muted group-open:inline"
                aria-hidden
              >
                &#9662;
              </span>
            </summary>
            <p className="mt-2 border-l border-line pl-3">
              {chain.disclaimer_extra}
            </p>
          </details>
        )}
        <DerivedNote chain={chain} />
        <CorrectionsNote chain={chain} />
      </footer>
    </main>
  );
}
