import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MealCompare, { type ComparePreset } from "@/components/MealCompare";
import type { Tint } from "@/lib/brand";
import { chainTint, getChain } from "@/lib/data";
import { fmtNutrient, type MealFacts } from "@/lib/compare";
import { listPairs, pairDishes, pairSlug, parsePair } from "@/lib/meals";
import { fmtDate, possessive } from "@/lib/text";
import { verdictSummary } from "@/lib/verdict";

// Both orderings are generated, because "chipotle vs cava" and "cava vs
// chipotle" are both things people type. Only the alphabetical one is
// canonical, so the mirror does not compete with it in search.
export async function generateStaticParams() {
  const pairs = await listPairs();
  return pairs.flatMap(([a, b]) => [
    { pair: `${a}-vs-${b}` },
    { pair: `${b}-vs-${a}` },
  ]);
}

/**
 * Any two real chains can be compared; only some are *recommended*.
 *
 * A pair with a shared dish gets a starting build, is prerendered, sits in the
 * sitemap and is indexed. Every other pair still works — it just opens empty
 * and is left out of search. Indexing all 105 pairs would add ~200 thin,
 * near-identical pages to a site with twenty good ones, which costs more in
 * quality signal than the long tail could ever return.
 */
async function load(slug: string) {
  const parsed = parsePair(slug);
  if (!parsed) return null;
  const [a, b] = parsed;
  const chains = await Promise.all([getChain(a), getChain(b)]);
  if (chains.some((c) => c === null)) return null; // an unknown chain is still a 404
  const dishes = await pairDishes(a, b);
  const tints = await Promise.all([chainTint(a), chainTint(b)]);
  // Each dish becomes a starting point for the live comparison. The first is
  // what renders server-side, so it is the version that gets indexed.
  const presets: ComparePreset[] = dishes.map(({ dish, meals }) => ({
    id: dish.id,
    name: dish.name,
    rule: dish.rule,
    sides: meals.map((m) => m.selections),
    portions: meals.map((m) => m.build.portion ?? 1),
  }));
  // The starting build's facts, for the title's answer: the description and
  // the FAQ answer are read from the same meals the page renders first.
  const first = dishes[0];
  const lead = first
    ? {
        dish: first.dish.name,
        facts: first.meals as MealFacts[],
        calories: first.meals.map((m) => m.totals.calories),
      }
    : null;
  return {
    a: chains[0]!,
    b: chains[1]!,
    tints: tints as [Tint, Tint],
    presets,
    lead,
    recommended: dishes.length > 0,
  };
}

/** The page's question, verbatim in the title, the h1 and the FAQ entity. */
const question = (a: string, b: string) => `Is ${a} or ${b} Healthier?`;

export async function generateMetadata(
  props: PageProps<"/compare/[pair]">,
): Promise<Metadata> {
  const { pair } = await props.params;
  const data = await load(pair);
  if (!data) return {};
  const { a, b, lead } = data;
  // The question, not a category label. Every health-intent search for a pair
  // is phrased "is X or Y healthier"; a title that promises a table under it
  // was the likeliest reason a page-one position drew a 2% click rate.
  const title = question(a.name, b.name);
  // The quick answer in the snippet -- one figure each -- then the reason to
  // click: the answer moves with the order and with what healthier means.
  const description = lead
    ? `${lead.dish} at ${a.name} is ${fmtNutrient(lead.calories[0], "calories")} cal against ${fmtNutrient(lead.calories[1], "calories")} at ${b.name}. Pick your order, pick what “healthier” means to you, and see both menus side by side.`
    : `Build a ${a.name} order and a ${b.name} order side by side, pick what “healthier” means to you, and compare calories, protein, sodium and saturated fat.`;
  const url = `/compare/${pairSlug(a.slug, b.slug)}`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    // follow, so the links out of an unrecommended pair still carry weight.
    ...(data.recommended ? {} : { robots: { index: false, follow: true } }),
    openGraph: { title: `${title} · Eatimate`, description, url, type: "website", siteName: "Eatimate" },
    twitter: { card: "summary_large_image", title: `${title} · Eatimate`, description },
  };
}

export default async function ComparePage(props: PageProps<"/compare/[pair]">) {
  const { pair } = await props.params;
  const data = await load(pair);
  if (!data) notFound();
  const { a, b, tints, presets, lead, recommended } = data;
  const names = [a.name, b.name];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 sm:pt-8">
      {/* The question, verbatim, and then the answer: the verdict block inside
          MealCompare is the next thing on the page. There is no dek. The one
          that sat here ("change either order and watch the difference move")
          said what the verdict block's own footnote now says, three lines
          higher on every phone, and the "as served, not per 100 g" method
          lives in the footer beside the note about the starting builds. */}
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight sm:text-3xl">
        {question(a.name, b.name)}
      </h1>

      {/* The question as a FAQ entity with the computed answer, so a search
          engine or an AI overview has something to cite rather than a page to
          absorb. The answer is the same text verdictSummary writes from the
          starting build; nothing here is hand-written per pair. */}
      {lead && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: question(a.name, b.name),
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: verdictSummary(lead.facts, names, [true, true], lead.dish),
                  },
                },
              ],
            }),
          }}
        />
      )}

      {!recommended && (
        // Says why the page is empty. Two chains that sell nothing alike have
        // no honest starting build, and inventing one would be worse than none.
        <p className="mt-3 max-w-2xl rounded-lg border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-muted">
          These two don&rsquo;t sell anything alike enough for us to suggest a
          starting order, so both sides start empty — build whatever you like.
        </p>
      )}

      <div className="mt-6">
        <MealCompare chains={[a, b]} tints={tints} presets={presets} />
      </div>

      <footer className="mt-6 space-y-2 border-t border-line pt-4 text-xs leading-relaxed text-muted">
        <p>
          Compared as served, not per 100 g: portions differ between chains,
          and that difference is part of the answer.{" "}
          {recommended &&
            "The starting builds are ours, not the chains’. Neither restaurant sells a dish designed to line up against the other, so each one is the closest honest reading of the rule stated above it. "}
          Nutrition figures come from{" "}
          {[a, b].map((c, i) => (
            <span key={c.slug}>
              {i > 0 && " and "}
              <a
                href={c.source.pdf_url ?? c.source.html_url!}
                className="underline decoration-line underline-offset-2 hover:text-fg"
                rel="nofollow noopener"
              >
                {possessive(c.name)} published data
              </a>{" "}
              (retrieved {fmtDate(c.source.retrieved)})
            </span>
          ))}
          . Not affiliated with or endorsed by either chain.
        </p>
        <p>
          One chain at a time:{" "}
          <Link href={`/${a.slug}`} className="underline decoration-line underline-offset-2 hover:text-fg">
            {a.name} calculator
          </Link>{" "}
          ·{" "}
          <Link href={`/${b.slug}`} className="underline decoration-line underline-offset-2 hover:text-fg">
            {b.name} calculator
          </Link>
        </p>
      </footer>
    </main>
  );
}
